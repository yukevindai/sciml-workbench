"""Small private observations; telemetry failures never change work authority."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import threading
from uuid import uuid4


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def safe_id(value):
    return value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,160}', value) else None


def write_observation(root, name, value):
    if root is None or name not in {'scientific', 'agent', 'model'}:
        return
    temporary = None
    try:
        directory = Path(root) / '.diagnostics'
        directory.mkdir(mode=0o700, exist_ok=True)
        if directory.is_symlink():
            return
        temporary = directory / ('.pending-' + uuid4().hex)
        with temporary.open('x', encoding='utf-8') as out:
            os.chmod(temporary, 0o600)
            json.dump(value, out, allow_nan=False)
        os.replace(temporary, directory / (name + '.json'))
    except (OSError, ValueError):
        pass
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def model_observation(settings, result):
    if result not in {'succeeded', 'failed', 'usage_unknown'}:
        return
    write_observation(getattr(settings, 'storage_root', None), 'model',
                      {'observed_at': timestamp(), 'result': result})


class Heartbeat:
    """Recent process observation is distinct from progress of its current work."""
    def __init__(self, root, role, *, interval=5):
        if role not in {'scientific', 'agent'} or interval <= 0:
            raise ValueError('Invalid heartbeat role or interval')
        self.root, self.role, self.interval = root, role, interval
        self.lock, self.done = threading.Lock(), threading.Event()
        self.value = {'phase': 'starting', 'progress_at': timestamp()}
        self.thread = threading.Thread(target=self._loop, daemon=True)

    def progress(self, phase, *, project_id=None, run_id=None, job_id=None):
        if phase not in {'starting', 'idle', 'busy', 'recovering', 'stopped'}:
            raise ValueError('Invalid heartbeat phase')
        with self.lock:
            self.value = {'phase': phase, 'progress_at': timestamp(),
                'project_id': safe_id(project_id), 'run_id': safe_id(run_id), 'job_id': safe_id(job_id)}
        self.emit()

    def emit(self):
        with self.lock:
            value = {**self.value, 'observed_at': timestamp()}
        write_observation(self.root, self.role, value)

    def _loop(self):
        while not self.done.wait(self.interval):
            self.emit()

    def __enter__(self):
        self.emit()
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.done.set()
        self.thread.join(timeout=self.interval + 1)
        self.progress('stopped')
