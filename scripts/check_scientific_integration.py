"""C10 real integration gate; source/constraint drift must fail before tests."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FOCUSED = ["test_scientific_surface.py", "test_audit_adapter.py", "test_split_integrity.py",
           "test_benchmark_adapter.py", "test_evidence_adapter.py", "test_failure_memory_adapter.py",
           "test_outcomes.py", "test_references.py", "test_evaluation.py", "test_reports.py",
           "test_archive.py", "test_workflow.py"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Run all backend regressions after the pin gate")
    args, pytest_args = parser.parse_known_args()
    subprocess.run([sys.executable, "scripts/check_scientific_surface.py"], cwd=ROOT, check=True)
    targets = ["backend/tests"] if args.all else ["backend/tests/" + name for name in FOCUSED]
    return subprocess.call([sys.executable, "-m", "pytest", *targets, "-q", *pytest_args], cwd=ROOT)


if __name__ == "__main__":
    sys.exit(main())
