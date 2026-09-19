import os
import sys

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
