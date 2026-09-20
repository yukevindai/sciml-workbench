"""The acceptance runner must not turn skipped or missing tests into success."""
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("statement,database,expected", [
    ("pass", "postgresql", 0), ("pytest.skip('unavailable')", "postgresql", 1),
    ("pytest.xfail('not implemented')", "postgresql", 1), ("assert False", "postgresql", 1),
    ("pass", "sqlite", 1),
])
def test_real_pytest_reports_enforce_complete_execution(tmp_path, statement, database, expected):
    (tmp_path / "test_probe.py").write_text(
        f"import pytest\n@pytest.mark.parametrize('database', [{database!r}])\n"
        f"def test_probe(database):\n    {statement}\n", encoding="utf-8")
    code = (
        "import sys, pytest; "
        f"sys.path.insert(0, {str(ROOT / 'scripts')!r}); "
        "import check_data_integration as gate; gate.SUITES = ('probe',); "
        "check = gate.Acceptance(); "
        "status = pytest.main(['test_probe.py', '-q', '-p', 'no:cacheprovider'], plugins=[check]); "
        "sys.exit(0 if status == 0 and check.complete else 1)"
    )
    env = {k: v for k, v in os.environ.items() if k != "PYTEST_ADDOPTS"}
    result = subprocess.run([sys.executable, "-c", code], cwd=tmp_path, env=env,
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == expected, result.stdout + result.stderr


@pytest.mark.parametrize("url", [None, "sqlite:///:memory:"])
def test_gate_refuses_missing_or_non_postgres_database(tmp_path, url):
    env = {k: v for k, v in os.environ.items() if k != "TEST_DATABASE_URL"}
    if url:
        env["TEST_DATABASE_URL"] = url
    result = subprocess.run([sys.executable, str(ROOT / "scripts/check_data_integration.py")],
                            cwd=tmp_path, env=env, capture_output=True, text=True, timeout=60)
    assert result.returncode == 2
    assert "PostgreSQL" in result.stderr
    assert not (tmp_path / "outputs").exists()
