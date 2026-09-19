"""Real POSIX task-tree deadline, shutdown and parent-loss tests."""

import os
from pathlib import Path
import signal
import subprocess
import sys
import time

import pytest

from workbench.processes import ProcessInterrupted, ProcessTimedOut, run_bounded


def wait_for(path, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if path.exists():
            return
        time.sleep(0.02)
    pytest.fail("Subprocess did not reach the synchronization point")


def alive(pid):
    # Orphans may remain zombies until the container's init reaps them. They
    # cannot execute; distinguish those from a surviving scientific process.
    status = Path(f"/proc/{pid}/stat")
    if status.exists():
        return status.read_text().split(") ", 1)[1][0] != "Z"
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def await_dead(pid):
    end = time.monotonic() + 5
    while alive(pid) and time.monotonic() < end:
        time.sleep(0.02)
    assert not alive(pid)


def stubborn_tree(directory):
    child_file = directory / "descendant.pid"
    root_file = directory / "root.pid"
    descendant = (
        "import os,signal,time,pathlib; signal.signal(signal.SIGTERM,signal.SIG_IGN); "
        f"pathlib.Path({str(child_file)!r}).write_text(str(os.getpid())); time.sleep(60)"
    )
    script = (
        "import os,signal,subprocess,sys,time,pathlib; signal.signal(signal.SIGTERM,signal.SIG_IGN); "
        f"pathlib.Path({str(root_file)!r}).write_text(str(os.getpid())); "
        f"subprocess.Popen([sys.executable,'-c',{descendant!r}]); time.sleep(60)"
    )
    return [sys.executable, "-c", script], root_file, child_file


def test_exhausted_budget_does_not_launch(monkeypatch):
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: pytest.fail("Must not spawn"))
    with pytest.raises(ProcessTimedOut):
        run_bounded(["unused"], time.monotonic() - 1)
    with pytest.raises(ProcessInterrupted):
        run_bounded(["unused"], time.monotonic() + 10, stopped=lambda: True)


@pytest.mark.skipif(os.name != "posix", reason="Linux/WSL process-group runtime")
@pytest.mark.parametrize("reason", ["deadline", "shutdown"])
def test_stubborn_descendants_are_terminated(tmp_path, monkeypatch, reason):
    command, root, descendant = stubborn_tree(tmp_path)
    # A wall-clock jump must not change the monotonic wait allowance.
    monkeypatch.setattr(time, "time", lambda: -1e12)
    started = time.monotonic()
    with pytest.raises(ProcessTimedOut if reason == "deadline" else ProcessInterrupted):
        run_bounded(command, started + (1.5 if reason == "deadline" else 30),
                    stopped=lambda: reason == "shutdown" and descendant.exists(), grace=0.2)
    assert time.monotonic() - started < 5
    assert descendant.exists()
    await_dead(int(root.read_text()))
    await_dead(int(descendant.read_text()))


@pytest.mark.skipif(os.name != "posix", reason="Linux/WSL process-group runtime")
def test_successful_child_cannot_leave_detached_group_members(tmp_path):
    command, root, descendant = stubborn_tree(tmp_path)
    # The direct child exits after its descendant is ready; cleanup must still
    # kill that descendant instead of stopping at child.poll() != None.
    original = command[-1]
    command[-1] = original.rsplit("time.sleep(60)", 1)[0] + f"\nwhile not pathlib.Path({str(descendant)!r}).exists(): time.sleep(.01)"
    assert run_bounded(command, time.monotonic() + 10, grace=0.2) == 0
    await_dead(int(descendant.read_text()))


@pytest.mark.skipif(sys.platform != "linux", reason="Linux guardian parent-loss runtime")
def test_guardian_cleans_compute_tree_when_worker_is_killed(tmp_path):
    command, root, descendant = stubborn_tree(tmp_path)
    guardian_file = tmp_path / "guardian.pid"
    guardian = (
        "from pathlib import Path; import os,time; from workbench.task import guard; "
        f"raise SystemExit(guard(Path({str(tmp_path)!r}), time.monotonic()+30, int(__import__('sys').argv[1]), command={command!r}))"
    )
    parent_script = (
        "import subprocess,os,sys,time,pathlib; "
        f"child=subprocess.Popen([sys.executable,'-c',{guardian!r},str(os.getpid())],start_new_session=True); "
        f"pathlib.Path({str(guardian_file)!r}).write_text(str(child.pid)); time.sleep(60)"
    )
    parent = subprocess.Popen([sys.executable, "-c", parent_script], start_new_session=True)
    try:
        wait_for(descendant)
        parent.kill()
        parent.wait(timeout=5)
        await_dead(int(root.read_text()))
        await_dead(int(descendant.read_text()))
        await_dead(int(guardian_file.read_text()))
    finally:
        if parent.poll() is None:
            parent.kill()
            parent.wait(timeout=5)
        # Clean only process groups created by this test if an assertion fails.
        for pid_file in (root, guardian_file):
            if pid_file.exists():
                pid = int(pid_file.read_text())
                if alive(pid):
                    try:
                        os.killpg(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
