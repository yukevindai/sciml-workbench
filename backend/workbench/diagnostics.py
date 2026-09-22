"""Read-only private operator diagnostics. No prompts, checkpoints or error prose."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
from typing import get_args

from sqlalchemy import select, func
from .agent_db import RunRow, ActionRow, RunJobRow, LeaseRow, EventRow, ReservationRow
from .contract_core import ErrorCode, RunState
from .db import Database, JobRow, ProjectRow
from .config import AgentSettings, load_settings
from .egress import SecretGuard, EgressDenied
from .telemetry import safe_id


def age(stamp, now):
    if isinstance(stamp, str):
        try:
            stamp = datetime.fromisoformat(stamp)
        except ValueError:
            return None
    if not isinstance(stamp, datetime):
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    seconds = (now - stamp).total_seconds()
    return round(seconds, 3) if seconds >= 0 else None


def observation(root, role, now, ttl):
    try:
        parent = Path(root) / '.diagnostics'
        path = parent / (role + '.json')
        if parent.is_symlink() or path.is_symlink() or not path.is_file() or path.stat().st_size > 8192:
            raise ValueError()
        value = json.loads(path.read_text(encoding='utf-8'))
        elapsed = age(value.get('observed_at'), now)
        if elapsed is None:
            raise ValueError()
        if role == 'model':
            result = value.get('result')
            if result not in {'succeeded', 'failed', 'usage_unknown'}:
                raise ValueError()
            return {'status': 'recent' if elapsed <= ttl else 'stale', 'age_seconds': elapsed,
                    'last_result': result}
        phase = value.get('phase')
        if phase not in {'starting', 'idle', 'busy', 'recovering', 'stopped'}:
            raise ValueError()
        return {'status': 'stopped' if phase == 'stopped' else 'recent' if elapsed <= ttl else 'stale',
                'age_seconds': elapsed, 'progress_age_seconds': age(value.get('progress_at'), now),
                'phase': phase}
    except (OSError, ValueError, AttributeError):
        return {'status': 'unknown'}


def resources(root):
    result = {'storage': {'status': 'unknown'}, 'memory': {'status': 'unknown'}}
    try:
        disk = shutil.disk_usage(root)
        result['storage'] = {'status': 'observed', 'total_bytes': disk.total, 'free_bytes': disk.free,
                             'free_fraction': disk.free / disk.total}
    except (OSError, ZeroDivisionError):
        pass
    try:
        # Cgroup v2 limits cover the service's co-located processes, unlike host RAM.
        current = int(Path('/sys/fs/cgroup/memory.current').read_text())
        maximum = int(Path('/sys/fs/cgroup/memory.max').read_text())
        if current >= 0 and maximum > 0:
            result['memory'] = {'status': 'observed', 'used_bytes': current,
                                'limit_bytes': maximum, 'used_fraction': current / maximum}
    except (OSError, ValueError):
        pass
    return result


def snapshot(db, settings, *, project_id=None, run_id=None, limit=100, now=None,
             stall_seconds=300, heartbeat_seconds=30, resource_probe=resources):
    if not 1 <= limit <= 500 or stall_seconds < 1 or heartbeat_seconds < 1:
        raise ValueError('Invalid diagnostic bounds')
    if run_id and not project_id:
        raise ValueError('Run scope requires a project')
    now = now or datetime.now(timezone.utc)
    alerts = set()
    with db.session() as s:
        if project_id and s.get(ProjectRow, project_id) is None:
            raise ValueError('Project not found')
        if run_id and s.scalar(select(RunRow.id).where(RunRow.id == run_id, RunRow.project_id == project_id)) is None:
            raise ValueError('Run not found in project')
        run_scope = ([RunRow.project_id == project_id] if project_id else []) + ([RunRow.id == run_id] if run_id else [])
        job_scope = [JobRow.project_id == project_id] if project_id else []
        if run_id:
            job_scope.append(JobRow.id.in_(select(RunJobRow.job_id).where(
                RunJobRow.run_id == run_id, RunJobRow.project_id == project_id)))
        run_counts = {state: count for state, count in s.execute(select(RunRow.state, func.count()).where(*run_scope).group_by(RunRow.state))
                      if state in get_args(RunState)}
        job_counts = {state: count for state, count in s.execute(select(JobRow.state, func.count()).where(*job_scope).group_by(JobRow.state))
                      if state in {'queued', 'running', 'succeeded', 'failed'}}
        oldest = s.scalar(select(func.min(JobRow.created_at)).where(*job_scope, JobRow.state == 'queued'))
        queue_age = age(oldest, now)
        if queue_age is not None and queue_age > stall_seconds:
            alerts.add('SCIENTIFIC_QUEUE_DELAYED')
        overdue = s.scalar(select(func.count()).select_from(JobRow).where(*job_scope,
            JobRow.state == 'running', JobRow.deadline_at < now))
        if overdue:
            alerts.add('SCIENTIFIC_DEADLINE_EXPIRED')
        # Unknown includes requests in flight. Alert only after the configured window.
        unknown_scope = [ReservationRow.payload['state'].as_string() == 'unknown',
                         ReservationRow.payload['intent']['resources']['model_requests'].as_integer() > 0]
        if project_id:
            unknown_scope.append(ReservationRow.project_id == project_id)
        if run_id:
            unknown_scope.append(ReservationRow.run_id == run_id)
        unknown = s.scalar(select(func.count()).select_from(ReservationRow).where(*unknown_scope))
        unknown_age = age(s.scalar(select(func.min(ReservationRow.created_at)).where(*unknown_scope)), now)
        if unknown_age is not None and unknown_age > stall_seconds:
            alerts.add('MODEL_USAGE_UNRESOLVED')
        runs = []
        # Run rows load durable state only; checkpoint contents are never opened.
        for row, lease, event in s.execute(select(RunRow, LeaseRow, EventRow).outerjoin(LeaseRow,
                LeaseRow.run_id == RunRow.id).outerjoin(EventRow,
                (EventRow.run_id == RunRow.id) & (EventRow.sequence == RunRow.event_sequence))
                .where(*run_scope).order_by(RunRow.created_at, RunRow.id).limit(limit)):
            elapsed = age(event.payload.get('created_at') if event else row.created_at, now)
            condition = 'terminal'
            if row.state in {'paused', 'waiting_for_input'}:
                condition = 'operator_wait'
            elif row.state == 'waiting_for_job':
                condition = 'scientific_wait'
            elif row.state == 'queued':
                condition = 'dispatch_delayed' if elapsed is not None and elapsed > stall_seconds else 'queued'
            elif row.state == 'running':
                condition = 'lease_expired' if lease is None or lease.expires_at is None or age(lease.expires_at, now) is not None else 'advancing'
            pointer = lease.checkpoint if lease and isinstance(lease.checkpoint, dict) else {}
            config = pointer.get('configurable', {})
            namespace = config.get('checkpoint_ns', '') if isinstance(config, dict) else ''
            match = re.fullmatch(r'lease-(\d+)', namespace) if isinstance(namespace, str) else None
            lag = max(0, lease.token - int(match[1])) if lease and match else lease.token if lease else 0
            pending = age(lease.last_claimed_at, now) if lease and lag else None
            runs.append({'project_id': safe_id(row.project_id), 'run_id': safe_id(row.id), 'state': row.state,
                         'condition': condition, 'state_age_seconds': elapsed,
                         'checkpoint_lag_advances': lag, 'checkpoint_pending_seconds': pending})
        # Alerts cover all scoped rows, even when detail is truncated.
        expired = s.scalar(select(func.count()).select_from(RunRow).outerjoin(LeaseRow, LeaseRow.run_id == RunRow.id)
            .where(*run_scope, RunRow.state == 'running', (LeaseRow.expires_at < now) | (LeaseRow.expires_at.is_(None))))
        if expired:
            alerts.add('AGENT_LEASE_EXPIRED')
            alerts.add('CHECKPOINT_ADVANCEMENT_INTERRUPTED')
        # Event timestamps are ISO JSON values; use rows here for portable SQLite/PG handling.
        queued_events = s.execute(select(RunRow.created_at, EventRow.payload).outerjoin(EventRow,
            (EventRow.run_id == RunRow.id) & (EventRow.sequence == RunRow.event_sequence))
            .where(*run_scope, RunRow.state == 'queued'))
        queued_age = max((age(payload.get('created_at') if payload else created, now) or 0
                          for created, payload in queued_events), default=0)
        if queued_age > stall_seconds:
            alerts.add('AGENT_QUEUE_DELAYED')
        jobs = [{'project_id': safe_id(j.project_id), 'job_id': safe_id(j.id), 'state': j.state,
                 'queue_age_seconds': age(j.created_at, now) if j.state == 'queued' else None,
                 'deadline_overdue': j.state == 'running' and age(j.deadline_at, now) is not None,
                 'error_code': j.error_code if j.error_code in get_args(ErrorCode) else 'INTERNAL_ERROR' if j.error_code or j.error else None}
                for j in s.scalars(select(JobRow).where(*job_scope).order_by(JobRow.created_at, JobRow.id).limit(limit))]
        action_scope = ([ActionRow.project_id == project_id] if project_id else []) + ([ActionRow.run_id == run_id] if run_id else [])
        action_count = s.scalar(select(func.count()).select_from(ActionRow).where(*action_scope))
        correlations = [{'project_id': safe_id(a.project_id), 'run_id': safe_id(a.run_id),
                         'action_id': safe_id(a.id), 'job_id': safe_id(link.job_id) if link else None,
                         'state': a.state if a.state in {'prepared', 'submitted', 'completed', 'failed', 'unknown', 'cancelled'} else 'unknown'}
                        for a, link in s.execute(select(ActionRow, RunJobRow).outerjoin(RunJobRow,
                            (RunJobRow.run_id == ActionRow.run_id) & (RunJobRow.action_id == ActionRow.id))
                            .where(*action_scope).order_by(ActionRow.run_id, ActionRow.id).limit(limit))]
    worker_views = {role: observation(settings.storage_root, role, now, heartbeat_seconds) for role in ('scientific', 'agent')}
    try:
        agents = AgentSettings()
        if not agents.agents_enabled:
            agent_config = 'disabled'
        else:
            agents.require_runtime()
            agent_config = 'configured'
    except Exception:
        agent_config = 'invalid'
    if worker_views['scientific']['status'] != 'recent':
        alerts.add('SCIENTIFIC_HEARTBEAT_UNAVAILABLE')
    if agent_config == 'configured' and worker_views['agent']['status'] != 'recent':
        alerts.add('AGENT_HEARTBEAT_UNAVAILABLE')
    if agent_config == 'invalid':
        alerts.add('AGENT_CONFIGURATION_INVALID')
    if agent_config == 'disabled':
        alerts.discard('AGENT_QUEUE_DELAYED')
        alerts.discard('AGENT_LEASE_EXPIRED')
        alerts.discard('CHECKPOINT_ADVANCEMENT_INTERRUPTED')
        for run in runs:
            if run['state'] in {'queued', 'running'}:
                run['condition'] = 'execution_disabled'
    model = observation(settings.storage_root, 'model', now, stall_seconds)
    if model.get('status') == 'recent' and model.get('last_result') in {'failed', 'usage_unknown'}:
        alerts.add('MODEL_CALL_FAILED')
    resource_view = resource_probe(settings.storage_root)
    disk, memory = resource_view['storage'], resource_view['memory']
    if disk['status'] == 'unknown':
        alerts.add('STORAGE_PROBE_UNAVAILABLE')
    elif disk['free_fraction'] < .1 or disk['free_bytes'] < 256 * 1024**2:
        alerts.add('STORAGE_LOW')
    if memory['status'] == 'observed' and memory['used_fraction'] >= .9:
        alerts.add('MEMORY_PRESSURE')
    revision = os.environ.get('RENDER_GIT_COMMIT', os.environ.get('WB_APPLICATION_REVISION', ''))
    result = {'observed_at': now.isoformat(), 'application_revision': revision if re.fullmatch(r'[a-f0-9]{40}', revision) else None,
              'agent_configuration': agent_config, 'workers': worker_views, 'model': model,
              'scientific_queue': {'counts': job_counts, 'oldest_queued_seconds': queue_age, 'overdue_jobs': overdue},
              'agent_queue': {'counts': run_counts, 'oldest_queued_seconds': queued_age, 'expired_leases': expired},
              'unknown_model_usage': {'reservations': unknown, 'oldest_seconds': unknown_age},
              'resources': resource_view, 'runs': runs, 'jobs': jobs, 'correlations': correlations,
              'truncated': {'runs': sum(run_counts.values()) > limit, 'jobs': sum(job_counts.values()) > limit,
                            'correlations': action_count > limit},
              'alerts': sorted(alerts)}
    SecretGuard(settings).check(result)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-id')
    parser.add_argument('--run-id')
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--stall-seconds', type=int, default=300)
    parser.add_argument('--heartbeat-seconds', type=int, default=30)
    args = parser.parse_args(argv)
    db = None
    try:
        settings = load_settings()
        db = Database(settings.database_url)
        result = snapshot(db, settings, **vars(args))
        print(json.dumps(result, sort_keys=True, allow_nan=False))
        return 1 if result['alerts'] else 0
    except EgressDenied:
        print('{"error_code":"DIAGNOSTICS_WITHHELD"}')
    except Exception:
        print('{"error_code":"DIAGNOSTICS_UNAVAILABLE"}')
    finally:
        if db:
            db.engine.dispose()
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
