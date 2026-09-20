"""Reserved agent process entry point. Durable scheduling requires B11/D11."""

import sys

from .config import AgentSettings, ConfigurationError, load_settings


def main():
    try:
        load_settings(AgentSettings).require_runtime()
    except ConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
