import os
import sys
import subprocess
import time

import pytest

from workbench.config import ConfigurationError, Settings
from workbench.serve import supervise


def test_render_database_url():
    for prefix in ("postgres://", "postgresql://"):
        cfg = Settings(
            database_url=prefix + "user:secret@host/db",
            api_token="a" * 40,
            efm_password="b" * 20,
        )
        assert cfg.database_url == "postgresql+psycopg://user:secret@host/db"


@pytest.mark.skipif(os.name != "posix", reason="Linux/WSL process-group runtime")
def test_supervisor_stops_peer_when_child_exits(tmp_path):
    # The persistent peer must be terminated before it can perform a later write.
    marker = tmp_path / "unexpected"
    peer = [
        sys.executable,
        "-c",
        "import time,pathlib; time.sleep(4); pathlib.Path("
        + repr(str(marker))
        + ").touch()",
    ]
    assert supervise([peer, [sys.executable, "-c", "import time; time.sleep(.2)"]]) == 1
    assert not marker.exists()


def test_supervisor_rejects_windows_before_spawning(monkeypatch):
    import workbench.serve as serve

    monkeypatch.setattr(serve.os, "name", "nt")
    monkeypatch.setattr(serve.subprocess, "Popen", lambda *a, **k: pytest.fail("must not spawn"))
    with pytest.raises(ConfigurationError, match="Docker Compose.*WSL2"):
        supervise([[sys.executable, "-c", "pass"]])


@pytest.mark.parametrize('enabled', [False, True])
def test_hosted_setup_precedes_independent_children(monkeypatch, enabled):
    import workbench.serve as serve
    from test_agent_runtime import configured

    settings = object()
    agent = configured(agents_enabled=enabled)
    calls = []
    monkeypatch.setattr(serve, 'require_posix', lambda: None)
    monkeypatch.setattr(serve, 'load_settings', lambda kind=None: agent if kind else settings)
    monkeypatch.setattr(serve, 'setup', lambda cfg: calls.append(('setup', cfg)))
    monkeypatch.setattr(serve, 'supervise', lambda commands: calls.append(('children', commands)) or 0)
    monkeypatch.setenv('PORT', '8123')
    assert serve.main() == 0
    assert calls[0] == ('setup', settings)
    commands = calls[1][1]
    assert commands[0][-2:] == ['--port', '8123']
    assert commands[1] == [sys.executable, '-m', 'workbench.worker']
    assert commands[2:] == ([[sys.executable, '-m', 'workbench.agent_worker']] if enabled else [])


def test_invalid_hosted_agent_fails_before_migration_or_spawn(monkeypatch):
    import workbench.serve as serve
    from test_agent_runtime import configured

    monkeypatch.setattr(serve, 'require_posix', lambda: None)
    monkeypatch.setattr(serve, 'load_settings', lambda kind=None:
        configured(agent_model_bounds='{}') if kind else object())
    monkeypatch.setattr(serve, 'setup', lambda *_: pytest.fail('must not migrate'))
    monkeypatch.setattr(serve, 'supervise', lambda *_: pytest.fail('must not spawn'))
    with pytest.raises(ConfigurationError, match='WB_AGENT_MODEL_BOUNDS'):
        serve.main()


@pytest.mark.skipif(os.name != 'posix', reason='Linux/WSL process-group runtime')
@pytest.mark.parametrize('failed_child', [0, 1, 2, None])
def test_three_child_runtime_stops_all_peers(tmp_path, failed_child):
    # Exercise each process failing and platform SIGTERM, using real processes.
    from pathlib import Path
    import signal

    commands = []
    for index in range(3):
        ready = tmp_path / str(index)
        commands.append([sys.executable, '-c',
            'import os,pathlib,time; '
            f'pathlib.Path({str(ready)!r}).write_text(str(os.getpid())); '
            'time.sleep(60)'])
    parent = subprocess.Popen([sys.executable, '-c',
        'from workbench.serve import supervise; '
        f'raise SystemExit(supervise({commands!r}))'])
    pids = []
    try:
        deadline = time.monotonic() + 15
        while not all((tmp_path / str(i)).exists() for i in range(3)):
            assert parent.poll() is None
            assert time.monotonic() < deadline, 'children did not start'
            time.sleep(.05)
        pids = [int(Path(tmp_path / str(i)).read_text()) for i in range(3)]
        os.kill(parent.pid if failed_child is None else pids[failed_child], signal.SIGTERM)
        assert parent.wait(timeout=15) == (0 if failed_child is None else 1)
        for pid in pids:
            with pytest.raises(ProcessLookupError):
                os.kill(pid, 0)
    finally:
        if parent.poll() is None:
            parent.terminate()
            parent.wait(timeout=15)
