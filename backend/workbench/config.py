from pathlib import Path
from pydantic import Field, SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class ConfigurationError(ValueError):
    """An operator-facing error that never includes configuration values."""


def validate_secret(value: SecretStr, name: str, minimum: int):
    raw = value.get_secret_value()
    if len(raw.strip()) < minimum or raw.lower().startswith("replace-with-"):
        raise ConfigurationError(f"Set {name} to an independent random secret ({minimum}+ characters).")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="WB_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )
    database_url: str = Field(repr=False)
    storage_root: Path = Path("./data")
    api_token: SecretStr
    efm_username: str = "workbench"
    efm_password: SecretStr
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, gt=0)
    max_rows: int = Field(default=20000, gt=0)
    job_timeout_seconds: int = Field(default=900, gt=0)

    @field_validator("database_url", mode="before")
    @classmethod
    def use_psycopg3(cls, value):
        # Accept Render's internal connection URL without manual editing.
        if isinstance(value, str):
            for prefix in ("postgres://", "postgresql://"):
                if value.startswith(prefix):
                    return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @field_validator("database_url")
    @classmethod
    def valid_database_url(cls, value):
        try:
            url = make_url(value)
            # SQLite remains available for isolated tests and schema generation.
            if url.drivername not in {"postgresql+psycopg", "sqlite"}:
                raise ValueError
            if url.drivername == "postgresql+psycopg" and not (url.host and url.database and url.username and url.password):
                raise ValueError
            if url.password and url.password.lower().startswith("replace-with-"):
                raise ValueError
            _ = url.port
        except Exception:
            raise ValueError("Set WB_DATABASE_URL to a complete PostgreSQL connection URL.") from None
        return value

    @field_validator("storage_root", "efm_username", mode="before")
    @classmethod
    def not_blank(cls, value):
        if isinstance(value, str) and not value.strip():
            raise ValueError("Must not be blank")
        return value

    def validate_secrets(self):
        validate_secret(self.api_token, "WB_API_TOKEN", 32)
        validate_secret(self.efm_password, "WB_EFM_PASSWORD", 12)


class AgentSettings(BaseSettings):
    """Private provider configuration; durable execution still requires D11."""

    model_config = SettingsConfigDict(
        env_prefix="WB_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )
    agents_enabled: bool = False
    model_provider: str = "anthropic"
    coordinator_model: str = ""
    specialist_model: str = ""
    anthropic_api_key: SecretStr = Field(default=SecretStr(""), validation_alias="ANTHROPIC_API_KEY")
    provider_timeout_seconds: float = Field(default=60, gt=0, le=300)
    provider_max_response_bytes: int = Field(default=262144, ge=1024, le=2000000)

    def validate_configuration(self):
        if not self.agents_enabled:
            return
        self.validate_provider()

    def validate_provider(self):
        import re

        if self.model_provider != "anthropic":
            raise ConfigurationError("WB_MODEL_PROVIDER must be anthropic; other provider adapters are not implemented.")
        for name in ("coordinator_model", "specialist_model"):
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,159}", getattr(self, name)):
                raise ConfigurationError(f"Set WB_{name.upper()} to a model ID available to your provider account.")
        validate_secret(self.anthropic_api_key, "ANTHROPIC_API_KEY", 1)

    def require_runtime(self):
        self.validate_configuration()
        if not self.agents_enabled:
            raise ConfigurationError("Agent execution is disabled (WB_AGENTS_ENABLED=0); use the manual workflow.")
        raise ConfigurationError(
            "D11 scheduler infrastructure is available; the adaptive coordinator integration (E04) is not implemented. "
            "Set WB_AGENTS_ENABLED=0 and omit the Compose agents profile to use the manual workflow."
        )


def load_settings(settings_type=Settings):
    try:
        settings = settings_type()
    except ValidationError as exc:
        names = sorted({
            str(error["loc"][0]) if str(error["loc"][0]) == "ANTHROPIC_API_KEY"
            else "WB_" + str(error["loc"][0]).upper()
            for error in exc.errors(include_input=False)
        })
        raise ConfigurationError("Missing or invalid configuration: " + ", ".join(names) + ". See .env.example.") from None
    if isinstance(settings, Settings):
        settings.validate_secrets()
    else:
        settings.validate_configuration()
    return settings


PINS = {
    "chemdata-auditor": "eff3ed3c43ec71e9ceecabc1f04d1dfb5c91c116",
    "cheme-ml-benchmarks": "db02d8963725a1d406b9b07eb6f4cc3436fbb082",
    "scientific-evidence-engine": "09f5ec810e8f04bf8d233ec12eb9448342ee5121",
    "experiment-failure-memory": "63492787cbbea6d03662db63f2d958a6eec8d804",
}


if __name__ == "__main__":
    import sys

    try:
        load_settings()
        agent = load_settings(AgentSettings)
        if agent.agents_enabled:
            agent.require_runtime()
    except ConfigurationError as exc:
        sys.exit(str(exc))
    print("Configuration valid; agent execution disabled. No services were contacted.")
