"""Run one CI gate and retain revision-specific evidence without environment values.

Commands must not contain secrets. Output stays in the CI log, not the receipt.
Strict JUnit gates reject missing, empty, skipped, or failed test reports.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def complete_junit(path):
    try:
        cases = list(ET.parse(path).getroot().iter('testcase'))
        return bool(cases) and all(
            not any(case.find(tag) is not None for tag in ('skipped', 'failure', 'error'))
            for case in cases)
    except (OSError, ET.ParseError):
        return False


def source_identity():
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    files = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
    digest = hashlib.sha256()
    for name in sorted(set(files.split(b'\0')) - {b''}):
        path = ROOT / os.fsdecode(name)
        digest.update(name + b'\0')
        digest.update(path.read_bytes() if path.is_file() else b'<missing>')
    return {'revision': revision, 'source_sha256': digest.hexdigest()}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--junit', type=Path)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('a command is required after --')
    os.chdir(ROOT)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.junit:
        args.junit.parent.mkdir(parents=True, exist_ok=True)
        args.junit.unlink(missing_ok=True)  # stale evidence cannot satisfy a new run
    receipt = {**source_identity(), 'gate': args.name,
        'started_at': datetime.now(timezone.utc).isoformat(), 'status': 'incomplete',
        'run_id': os.environ.get('GITHUB_RUN_ID'), 'attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
        'limitations': ['Local/CI fixtures only; no hosted acceptance or live-provider quality claim.',
                        'Restore tests use disposable synthetic databases, not production backups.']}
    args.output.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    try:
        code = subprocess.call(command)
    except OSError:
        code = 127
    complete = complete_junit(args.junit) if args.junit else None
    receipt.update(exit_code=code, junit_complete=complete,
                   status='passed' if code == 0 and complete is not False else 'failed',
                   finished_at=datetime.now(timezone.utc).isoformat())
    args.output.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return 0 if receipt['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
