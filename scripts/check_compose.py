"""Check the resolved Compose environment boundary without printing secret values.

Run from the repository root; optionally pass a standalone Compose executable.
Requires the same four local secrets as `docker compose config`.
"""

import json
import subprocess
import sys


def check(document):
    services = document["services"]
    private = {"WB_DATABASE_URL", "WB_STORAGE_ROOT", "WB_API_TOKEN", "WB_EFM_USERNAME", "WB_EFM_PASSWORD", "WB_JOB_TIMEOUT_SECONDS"}
    agent = {"WB_AGENTS_ENABLED", "WB_MODEL_PROVIDER", "WB_COORDINATOR_MODEL", "WB_SPECIALIST_MODEL", "ANTHROPIC_API_KEY",
             "WB_AGENT_MODEL_BOUNDS", "WB_AGENT_MODEL_PRICES", "WB_AGENT_LEASE_SECONDS",
             "WB_AGENT_MAX_OUTPUT_TOKENS", "WB_PROVIDER_TIMEOUT_SECONDS"}
    web = {"WB_API_URL", "WB_API_TOKEN", "WB_PUBLIC_ORIGIN", "WB_REQUIRE_LOGIN", "WB_LOGIN_USERNAME", "WB_LOGIN_PASSWORD"}
    for name in ("api", "worker", "setup", "agent-worker", "web"):
        service = services[name]
        allowed = web if name == "web" else private | (agent if name in {"api", "agent-worker"} else set())
        assert set(service["environment"]) == allowed, f"Unexpected environment keys for {name}"
        assert not service["build"].get("args"), f"Build arguments forbidden for {name}"
        assert not service["build"].get("secrets"), f"Build secrets forbidden for {name}"
        if name != "web":
            assert not service.get("ports"), f"Private port published by {name}"
            assert service["volumes"][0]["target"] == "/data", f"Storage mount missing for {name}"
    assert not services["postgres"].get("ports"), "Database port must remain private"
    assert services["web"]["ports"][0]["host_ip"] == "127.0.0.1", "Web must bind loopback"
    assert services["setup"]["depends_on"]["postgres"]["condition"] == "service_healthy", "Setup must wait for PostgreSQL"
    assert services["setup"]["command"] == ["python", "-m", "workbench.setup"], "Use the validated setup entry point"
    for name in ("api", "worker", "agent-worker"):
        assert services[name]["depends_on"]["setup"]["condition"] == "service_completed_successfully", f"{name} must wait for setup"
    assert services["web"]["depends_on"]["api"]["condition"] == "service_healthy", "Web must wait for API health"
    assert services["agent-worker"]["profiles"] == ["agents"], "Agent process must be opt-in"
    assert services["agent-worker"]["command"] == ["python", "-m", "workbench.agent_worker"], "Agent process must be independent"
    assert services["agent-worker"]["restart"] == "no", "Unavailable agent runtime must not restart-loop"
    for name in ("api", "agent-worker"):
        for key in ("WB_AGENT_MODEL_BOUNDS", "WB_AGENT_MODEL_PRICES"):
            try:
                value = json.loads(services[name]["environment"][key])
            except (ValueError, TypeError):
                raise AssertionError(f"{name} {key} must resolve to a JSON object") from None
            assert isinstance(value, dict), f"{name} {key} must resolve to a JSON object"


def main():
    compose = [sys.argv[1]] if len(sys.argv) > 1 else ["docker", "compose"]
    result = subprocess.run(compose + ["--profile", "agents", "config", "--format", "json"], capture_output=True, text=True)
    if result.returncode:
        # Compose diagnostics may contain expanded values; do not echo them.
        sys.exit("Compose configuration failed. Set the four secrets in .env.example and check Compose locally.")
    check(json.loads(result.stdout))
    print("Compose environment isolation, private ports, and startup ordering verified.")


if __name__ == "__main__":
    main()
