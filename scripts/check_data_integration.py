"""B10 PostgreSQL data/API acceptance. Missing or skipped coverage fails closed."""
import argparse
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SUITES = (
    "metadata", "intake", "artifacts", "submission", "reports", "publication",
    "external_operations", "projections", "agent_runs", "agent_scheduler",
    "budgets", "recovery", "data_integration",
)


class Acceptance:
    def __init__(self):
        self.expected = set()
        self.passed = set()
        self.incomplete = set()

    @property
    def complete(self):
        return bool(self.expected) and not self.incomplete and self.expected == self.passed

    def pytest_collection_modifyitems(self, config, items):
        # Only database-parametrized PostgreSQL cases count toward this gate.
        selected, deselected = [], []
        for item in items:
            params = getattr(getattr(item, "callspec", None), "params", {})
            (selected if "postgresql" in params.values() else deselected).append(item)
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected
        self.expected = {item.nodeid for item in selected}
        covered = {Path(str(item.path)).stem for item in selected}
        missing = {"test_" + name for name in SUITES} - covered
        if missing:
            import pytest
            raise pytest.UsageError("Missing PostgreSQL suites: " + ", ".join(sorted(missing)))

    def pytest_runtest_logreport(self, report):
        if report.when == "call" and report.passed:
            self.passed.add(report.nodeid)
        if report.skipped or report.failed or hasattr(report, "wasxfail"):
            self.incomplete.add(report.nodeid)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--junitxml", default="outputs/b10-results.xml")
    parser.add_argument("--basetemp")
    args = parser.parse_args()
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        parser.error("TEST_DATABASE_URL must name a disposable PostgreSQL database")
    engine = None
    try:
        if make_url(url).get_backend_name() != "postgresql":
            raise ValueError("PostgreSQL required")
        engine = create_engine(url, connect_args={"connect_timeout": 10})
        with engine.connect() as connection:
            version = connection.scalar(text("SHOW server_version"))
    except Exception:
        # Connection exceptions may contain credentials/host details.
        parser.error("PostgreSQL preflight failed; check TEST_DATABASE_URL and server availability")
    finally:
        if engine is not None:
            engine.dispose()
    print(f"B10 PostgreSQL {version}; isolated fixture schemas; no skipped cases accepted", flush=True)
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT / "backend"))
    # Environment options must not silently narrow this acceptance matrix.
    os.environ.pop("PYTEST_ADDOPTS", None)
    import pytest
    gate = Acceptance()
    options = [str(ROOT / "backend/tests" / f"test_{name}.py") for name in SUITES]
    options += ["-q", "-rs", "--tb=short", "-o", "addopts=", "-p", "no:cacheprovider",
                "--junitxml", args.junitxml]
    if args.basetemp:
        options += ["--basetemp", args.basetemp]
    status = pytest.main(options, plugins=[gate])
    if status:
        return int(status)
    if not gate.complete:
        print("B10 FAILED: skipped, xfailed, or unexecuted PostgreSQL acceptance cases", file=sys.stderr)
        return 1
    print(f"B10 PASS: {len(gate.passed)} PostgreSQL cases completed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
