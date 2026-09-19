"""Reserved agent process entry point. No scheduler or provider calls exist yet."""

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
