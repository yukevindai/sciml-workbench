"""Provision through the supported Failure Memory operator CLI; no direct DB access."""

import os
import subprocess
import sys
from .config import ConfigurationError, load_settings


def main(settings=None):
    s = settings or load_settings()
    s.validate_secrets()
    s.storage_root.mkdir(parents=True, exist_ok=True)
    database = s.storage_root / "failure-memory.sqlite"
    marker = s.storage_root / ".efm-provisioned"
    base = [sys.executable, "-m", "failure_memory.cli", "--database", str(database)]
    subprocess.run(base + ["init"], check=True)
    if not marker.exists():
        env = dict(os.environ, WB_PROVISION_PASSWORD=s.efm_password.get_secret_value())
        subprocess.run(
            base
            + [
                "create-user",
                s.efm_username,
                "--display-name",
                "SciML Workbench",
                "--password-env",
                "WB_PROVISION_PASSWORD",
            ],
            env=env,
            check=True,
        )
        marker.write_text("Provisioned using upstream CLI.\n")


if __name__ == "__main__":
    try:
        main()
    except ConfigurationError as exc:
        sys.exit(str(exc))
