"""Provision through the supported Failure Memory operator CLI; no direct DB access."""

import os
import subprocess
from .config import Settings


def main():
    s = Settings()
    s.validate_secrets()
    s.storage_root.mkdir(parents=True, exist_ok=True)
    database = s.storage_root / "failure-memory.sqlite"
    marker = s.storage_root / ".efm-provisioned"
    base = ["failure-memory", "--database", str(database)]
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
    main()
