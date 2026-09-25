"""D09 evidence must fail closed, including stale reports and command failures."""
import importlib.util
import json
from pathlib import Path
import sys

import pytest

spec = importlib.util.spec_from_file_location('ci_gate', Path(__file__).resolve().parents[2] / 'scripts/ci_gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


@pytest.mark.parametrize('xml,complete', [
    ('<testsuites><testsuite><testcase/></testsuite></testsuites>', True),
    ('<testsuite/>', False), ('broken', False),
    *[(f'<testsuite><testcase><{tag}/></testcase></testsuite>', False)
      for tag in ('skipped', 'failure', 'error')],
])
def test_junit(tmp_path, xml, complete):
    report = tmp_path / 'tests.xml'
    report.write_text(xml)
    assert gate.complete_junit(report) is complete
    assert not gate.complete_junit(tmp_path / 'missing.xml')


@pytest.mark.parametrize('mode', ['pass', 'fail', 'stale', 'missing-command'])
def test_receipt(tmp_path, monkeypatch, mode):
    monkeypatch.setattr(gate, 'source_identity', lambda: {'revision': 'test', 'source_sha256': 'hash'})
    report, receipt = tmp_path / 'tests.xml', tmp_path / 'receipt.json'
    report.write_text('<testsuite><testcase/></testsuite>')
    command = [sys.executable, '-c',
        f"from pathlib import Path; Path({str(report)!r}).write_text('<testsuite><testcase/></testsuite>')"]
    if mode == 'fail':
        command = [sys.executable, '-c', 'raise SystemExit(2)']
    elif mode == 'stale':
        command = [sys.executable, '-c', 'pass']
    elif mode == 'missing-command':
        command = [str(tmp_path / 'no-such-executable')]
    result = gate.main(['--name', 'probe', '--output', str(receipt), '--junit', str(report), '--', *command])
    value = json.loads(receipt.read_text())
    assert result == (0 if mode == 'pass' else 1)
    assert value['status'] == ('passed' if mode == 'pass' else 'failed')
    assert value['revision'] == 'test'
