"""D01 startup failures must be safe, actionable, and precede side effects."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import SecretStr

from workbench import bootstrap, setup
from workbench.config import AgentSettings, ConfigurationError, Settings, load_settings


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch, tmp_path):
    for name in os.environ:
        if name.startswith("WB_") or name == "ANTHROPIC_API_KEY":
            monkeypatch.delenv(name)
    monkeypatch.chdir(tmp_path)


def valid_settings(tmp_path):
    return Settings(
        database_url="sqlite://", storage_root=tmp_path,
        api_token="a" * 48, efm_password="b" * 24,
    )


def test_missing_configuration_names_variables_without_input(monkeypatch):
    canary = "private-provider-key-must-never-be-printed"
    monkeypatch.setenv("ANTHROPIC_API_KEY", canary)
    with pytest.raises(ConfigurationError) as error:
        load_settings()
    assert "WB_DATABASE_URL" in str(error.value)
    assert "WB_API_TOKEN" in str(error.value)
    assert "WB_EFM_PASSWORD" in str(error.value)
    assert canary not in str(error.value)


@pytest.mark.parametrize("name,value", [
    ("WB_DATABASE_URL", "postgresql://user:canary-database-password@host:not-a-port/db"),
    ("WB_JOB_TIMEOUT_SECONDS", "canary-invalid-timeout"),
    ("WB_MAX_ROWS", "0"),
    ("WB_MAX_UPLOAD_BYTES", "-1"),
    ("WB_STORAGE_ROOT", ""),
    ("WB_EFM_USERNAME", ""),
])
def test_invalid_configuration_is_redacted(monkeypatch, name, value):
    monkeypatch.setenv("WB_DATABASE_URL", "postgresql://user:secret@host/db")
    monkeypatch.setenv("WB_API_TOKEN", "a" * 48)
    monkeypatch.setenv("WB_EFM_PASSWORD", "b" * 24)
    monkeypatch.setenv(name, value)
    with pytest.raises(ConfigurationError) as error:
        load_settings()
    assert name in str(error.value)
    assert "canary" not in str(error.value)


@pytest.mark.parametrize("field,value,variable", [
    ("api_token", "short", "WB_API_TOKEN"),
    ("api_token", "replace-with-at-least-32-random-characters", "WB_API_TOKEN"),
    ("efm_password", "replace-with-a-strong-random-password", "WB_EFM_PASSWORD"),
    ("efm_password", " " * 20, "WB_EFM_PASSWORD"),
])
def test_unsafe_secrets_rejected_before_setup(tmp_path, monkeypatch, field, value, variable):
    settings = valid_settings(tmp_path).model_copy(update={field: SecretStr(value)})
    monkeypatch.setattr(setup.subprocess, "run", lambda *a, **k: pytest.fail("must not migrate"))
    with pytest.raises(ConfigurationError, match=variable):
        setup.main(settings)


def test_database_and_provider_secrets_not_in_repr():
    settings = Settings(database_url="postgresql://user:canary-db@host/db", api_token="a" * 48, efm_password="b" * 24)
    agent = AgentSettings(ANTHROPIC_API_KEY="canary-provider")
    assert "canary" not in repr(settings) + repr(agent)


def test_agent_disabled_needs_no_credentials():
    assert not load_settings(AgentSettings).agents_enabled
    result = subprocess.run([sys.executable, "-m", "workbench.agent_worker"], capture_output=True, text=True)
    assert result.returncode == 2
    assert "disabled" in result.stderr and "manual workflow" in result.stderr
    assert "Traceback" not in result.stderr


@pytest.mark.parametrize("updates,expected", [
    ({"model_provider": "unknown"}, "WB_MODEL_PROVIDER"),
    ({"coordinator_model": ""}, "WB_COORDINATOR_MODEL"),
    ({"specialist_model": " "}, "WB_SPECIALIST_MODEL"),
    ({"ANTHROPIC_API_KEY": ""}, "ANTHROPIC_API_KEY"),
    ({"ANTHROPIC_API_KEY": "replace-with-a-key"}, "ANTHROPIC_API_KEY"),
    ({}, "D11"),
])
def test_agent_opt_in_never_claims_an_available_runtime(updates, expected):
    values = dict(agents_enabled=True, coordinator_model="account-model", specialist_model="account-model", ANTHROPIC_API_KEY="canary-key")
    values.update(updates)
    with pytest.raises(ConfigurationError, match=expected) as error:
        AgentSettings(**values).require_runtime()
    assert "canary-key" not in str(error.value)


def test_setup_orders_migration_before_provisioning(monkeypatch, tmp_path):
    calls = []
    settings = valid_settings(tmp_path)
    monkeypatch.setattr(setup.subprocess, "run", lambda cmd, **kw: calls.append((cmd, kw)))
    monkeypatch.setattr(setup, "bootstrap", lambda cfg: calls.append(cfg))
    setup.main(settings)
    assert calls == [([sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", "upgrade", "head"], {"check": True}), settings]


def test_migration_failure_prevents_provisioning(monkeypatch, tmp_path):
    def fail(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "alembic")
    monkeypatch.setattr(setup.subprocess, "run", fail)
    monkeypatch.setattr(setup, "bootstrap", lambda cfg: pytest.fail("must not provision"))
    with pytest.raises(subprocess.CalledProcessError):
        setup.main(valid_settings(tmp_path))


def test_failed_provisioning_does_not_write_marker(monkeypatch, tmp_path):
    def fail_create(cmd, **kwargs):
        if "create-user" in cmd:
            assert "b" * 24 not in cmd
            assert kwargs["env"]["WB_PROVISION_PASSWORD"] == "b" * 24
            raise subprocess.CalledProcessError(1, cmd)
    monkeypatch.setattr(bootstrap.subprocess, "run", fail_create)
    with pytest.raises(subprocess.CalledProcessError):
        bootstrap.main(valid_settings(tmp_path))
    assert not (tmp_path / ".efm-provisioned").exists()


def test_real_setup_can_be_repeated(monkeypatch, tmp_path):
    # Use the real pinned upstream CLI and Alembic; no research database touched.
    root = Path(__file__).resolve().parents[2]
    database = tmp_path / "metadata.sqlite"
    storage = tmp_path / "storage"
    monkeypatch.setenv("WB_DATABASE_URL", "sqlite:///" + database.as_posix())
    monkeypatch.setenv("WB_STORAGE_ROOT", str(storage))
    monkeypatch.setenv("WB_API_TOKEN", "a" * 48)
    monkeypatch.setenv("WB_EFM_PASSWORD", "b" * 24)
    for _ in range(2):
        result = subprocess.run([sys.executable, "-m", "workbench.setup"], cwd=root, capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
        assert database.exists()
        assert (storage / "failure-memory.sqlite").exists()
        assert (storage / ".efm-provisioned").exists()


def test_hosted_setup_failure_prevents_children(monkeypatch):
    from workbench import serve

    monkeypatch.setattr(serve, "require_posix", lambda: None)
    monkeypatch.setenv("WB_DATABASE_URL", "sqlite://")
    monkeypatch.setenv("WB_API_TOKEN", "a" * 48)
    monkeypatch.setenv("WB_EFM_PASSWORD", "b" * 24)
    def fail(*args):
        raise subprocess.CalledProcessError(1, "setup")
    monkeypatch.setattr(serve, "setup", fail)
    monkeypatch.setattr(serve, "supervise", lambda *args: pytest.fail("must not start children"))
    with pytest.raises(subprocess.CalledProcessError):
        serve.main()
