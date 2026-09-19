"""Bounded waits and process-group cleanup for the Linux scientific runtime."""

import os
import signal
import subprocess
import time


class ProcessTimedOut(Exception):
    pass


class ProcessInterrupted(Exception):
    pass


def stop_process_tree(child, grace=2.0):
    def send(sig):
        try:
            if os.name == "posix":
                os.killpg(child.pid, sig)
            elif child.poll() is None:
                (child.terminate if sig == signal.SIGTERM else child.kill)()
        except ProcessLookupError:
            pass

    send(signal.SIGTERM)
    try:
        child.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        pass
    # Include descendants left alive after their immediate parent exited.
    send(signal.SIGKILL if os.name == "posix" else signal.SIGTERM)
    if os.name != "posix" and child.poll() is None:
        child.kill()
    child.wait(timeout=grace)


def run_bounded(command, deadline, *, stopped=lambda: False, env=None, cwd=None, grace=2.0):
    if stopped():
        raise ProcessInterrupted()
    if time.monotonic() >= deadline:
        raise ProcessTimedOut()
    child = subprocess.Popen(command, start_new_session=True, env=env, cwd=cwd,
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        while True:
            if stopped():
                raise ProcessInterrupted()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProcessTimedOut()
            code = child.poll()
            if code is not None:
                return code
            time.sleep(min(0.05, remaining))
    finally:
        stop_process_tree(child, grace)
