"""E15 deterministic gate or explicitly opted-in, bounded synthetic live pilot.

Run from the repository root with the backend development environment.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
import platform
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'backend/tests/fixtures/autonomy/v1.json'


def comparison(results):
    groups = {}
    for result in results:
        key = result['case'] + ':' + result['database'] + ':' + result['variant']
        groups.setdefault(key, []).append(result)
    return {key: {
        'sample_size': len(values),
        'passing_outcomes': sum(all(r['quality'].values()) for r in values),
        'required_interventions': [r['observation']['required_interventions'] for r in values],
        'model_requests': [r['observation']['usage']['model_requests'] for r in values],
        'token_categories': [r['observation']['usage']['billed_token_categories'] for r in values],
        'cost': [r['observation']['usage']['cost'] for r in values],
        'elapsed_seconds': sorted(r['elapsed_seconds'] for r in values),
        'claim_support_score': None,
    } for key, values in groups.items()}


class Recorder:
    def __init__(self, path, metadata):
        self.path, self.metadata = path, metadata
        self.tests, self.results = [], []
        self.write()

    def write(self, exit_code=None):
        value = {**self.metadata, 'exit_code': exit_code, 'tests': self.tests,
                 'counts': dict(Counter(t['outcome'] for t in self.tests)),
                 'results': self.results, 'comparison': comparison(self.results)}
        temp = self.path.with_suffix('.tmp')
        temp.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        temp.replace(self.path)

    def pytest_runtest_logreport(self, report):
        if report.when == 'call' or report.failed or (report.when == 'setup' and report.skipped):
            self.tests.append({'nodeid': report.nodeid, 'phase': report.when, 'outcome': report.outcome})
            for name, value in report.user_properties:
                if name == 'e15_result' and report.when == 'call':
                    self.results.append(json.loads(value))
            self.write()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'outputs/e15/report.json')
    parser.add_argument('--live', action='store_true', help='Opt into paid provider calls with synthetic inputs only')
    parser.add_argument('--attempts', type=int, default=1, choices=range(1, 6))
    parser.add_argument('--per-run-usd', type=float, help='Required live ceiling, 0 < USD <= 5; reviewed prices required')
    args = parser.parse_args(argv)
    os.chdir(ROOT)
    # An inherited opt-in must never turn the default deterministic gate live.
    for key in ('WB_E15_LIVE', 'WB_E15_ATTEMPTS', 'WB_E15_CEILING'):
        os.environ.pop(key, None)
    manifest = json.loads(MANIFEST.read_text())
    if args.live:
        if args.per_run_usd is None or not 0 < args.per_run_usd <= 5:
            parser.error('--live requires --per-run-usd in (0, 5]')
        from workbench.config import AgentSettings, ConfigurationError, load_settings
        try:
            agents = load_settings(AgentSettings)
            agents.require_runtime()
            _, prices = agents.runtime_limits()
            if not {agents.coordinator_model, agents.specialist_model} <= prices.keys():
                parser.error('Live evaluation requires reviewed pricing for both configured models')
        except ConfigurationError as exc:
            parser.error(str(exc))
        os.environ.update(WB_E15_LIVE='1', WB_E15_ATTEMPTS=str(args.attempts), WB_E15_CEILING=str(args.per_run_usd))
    elif args.attempts != 1 or args.per_run_usd is not None:
        parser.error('Budget and attempt overrides require --live')
    args.output = args.output.resolve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    diff = subprocess.check_output(['git', 'diff', 'HEAD', '--', 'backend', 'scripts', 'docs', '.github'])
    # Include untracked evaluation code as well as tracked modifications.
    source = hashlib.sha256()
    for base in ('backend/workbench', 'backend/tests', 'scripts'):
        for path in sorted((ROOT / base).rglob('*')):
            if path.is_file() and path.suffix in {'.py', '.json'} and '__pycache__' not in path.parts:
                source.update(path.relative_to(ROOT).as_posix().encode() + b'\0' + path.read_bytes())
    metadata = {'suite': manifest['version'], 'started_at': datetime.now(timezone.utc).isoformat(),
        'revision': revision, 'diff_sha256': hashlib.sha256(diff).hexdigest(),
        'python': platform.python_version(), 'platform': platform.platform(),
        'source_sha256': source.hexdigest(), 'manifest_sha256': hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
        'mode': 'live' if args.live else 'deterministic', 'planned_attempts_per_arm': args.attempts,
        'planned_live_runs': len(manifest['cases']) * 2 * args.attempts if args.live else 0,
        'maximum_planned_usd': len(manifest['cases']) * 2 * args.attempts * args.per_run_usd if args.live else None,
        'limitations': manifest['limitations'] + ['No general claim of specialist improvement.',
            'Cost is a reviewed-price estimate or explicitly unknown, never an invoice.',
            'Partial reports with null exit_code are incomplete; inspect failed/setup cases, not just comparison rows.']}
    recorder = Recorder(args.output, metadata)
    import pytest
    modules = ['test_autonomy_suite.py'] if args.live else manifest['gate_modules']
    code = pytest.main([*[str(ROOT / 'backend/tests' / m) for m in modules], '-q',
        *(['-k', 'test_frozen_audit'] if args.live else []),
        '--tb=no' if args.live else '--tb=short',
        '--basetemp=' + str(args.output.parent / 'tmp'),
        '-o', 'cache_dir=' + str(args.output.parent / 'cache')], plugins=[recorder])
    recorder.write(int(code))
    print('E15 report: ' + str(args.output))
    return int(code)


if __name__ == '__main__':
    sys.exit(main())
