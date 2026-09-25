"""The evaluation runner fails closed before a paid request is possible."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

SPEC = importlib.util.spec_from_file_location('e15_runner', Path(__file__).resolve().parents[2] / 'scripts/check_agent_evaluation.py')
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


@pytest.mark.parametrize('args', [
    ['--live'], ['--live', '--per-run-usd', '0'], ['--live', '--per-run-usd', 'nan'],
    ['--live', '--per-run-usd', '6'], ['--attempts', '2'], ['--attempts', '6'],
])
def test_invalid_live_bounds_stop_before_configuration_or_io(args, monkeypatch):
    import workbench.config
    monkeypatch.setattr(workbench.config, 'load_settings', lambda *a: pytest.fail('Configuration must not be read'))
    with pytest.raises(SystemExit) as error:
        runner.main(args)
    assert error.value.code == 2


def test_failed_setup_is_retained_without_exception_contents(tmp_path):
    path = tmp_path / 'report.json'
    recorder = runner.Recorder(path, {'mode': 'deterministic'})
    recorder.pytest_runtest_logreport(SimpleNamespace(when='setup', failed=True, skipped=False,
        nodeid='fixture', outcome='failed', user_properties=[], longrepr='private-error-canary'))
    report = json.loads(path.read_text())
    assert report['counts'] == {'failed': 1}
    assert report['exit_code'] is None and report['comparison'] == {}
    assert 'private-error-canary' not in path.read_text()
