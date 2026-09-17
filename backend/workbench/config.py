from pathlib import Path
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WB_", env_file=".env", extra="ignore")
    database_url: str = (
        "postgresql+psycopg://workbench:workbench@localhost:5432/workbench"
    )
    storage_root: Path = Path("./data")
    api_token: SecretStr
    efm_username: str = "workbench"
    efm_password: SecretStr
    max_upload_bytes: int = 10 * 1024 * 1024
    max_rows: int = 20000
    job_timeout_seconds: int = 900

    def validate_secrets(self):
        if (
            len(self.api_token.get_secret_value()) < 32
            or len(self.efm_password.get_secret_value()) < 12
        ):
            raise ValueError(
                "Configure a 32+ character API token and 12+ character Failure Memory password"
            )


PINS = {
    "chemdata-auditor": "eff3ed3c43ec71e9ceecabc1f04d1dfb5c91c116",
    "cheme-ml-benchmarks": "db02d8963725a1d406b9b07eb6f4cc3436fbb082",
    "scientific-evidence-engine": "09f5ec810e8f04bf8d233ec12eb9448342ee5121",
    "experiment-failure-memory": "63492787cbbea6d03662db63f2d958a6eec8d804",
}
