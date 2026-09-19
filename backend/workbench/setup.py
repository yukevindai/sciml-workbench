"""Validate configuration, migrate metadata, then provision upstream storage."""

import subprocess
import sys

from .bootstrap import main as bootstrap
from .config import ConfigurationError, load_settings


def main(settings=None):
    settings = settings or load_settings()
    settings.validate_secrets()
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", "upgrade", "head"],
        check=True,
    )
    bootstrap(settings)


if __name__ == "__main__":
    try:
        main()
    except ConfigurationError as exc:
        sys.exit(str(exc))
