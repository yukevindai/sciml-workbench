"""Generate synthetic A10 configuration; never starts a live provider worker."""
import json
from pathlib import Path


def main():
    models = ['a10-scripted-coordinator', 'a10-scripted-specialist']
    bounds = {model: dict(model=model, revision='a10-ci', source_reference='scripted-only',
        max_request_bytes=100000, input_tokens=100000, max_output_tokens=1024,
        max_active_seconds=120) for model in models}
    values = dict(POSTGRES_PASSWORD='compose-test-password',
        WB_API_TOKEN='compose-test-token-at-least-32-characters',
        WB_EFM_PASSWORD='compose-test-failure-memory-password',
        WB_LOGIN_PASSWORD='compose-test-private-workspace-password',
        WB_LOGIN_USERNAME='workbench', WB_AGENTS_ENABLED='1',
        WB_COORDINATOR_MODEL=models[0], WB_SPECIALIST_MODEL=models[1],
        ANTHROPIC_API_KEY='a10-scripted-never-sent',
        WB_AGENT_MODEL_BOUNDS=json.dumps(bounds, separators=(',', ':')))
    path = Path(__file__).resolve().parents[2] / 'outputs/a10/ci.env'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(f"{key}='{value}'\n" for key, value in values.items()), encoding='utf-8')


if __name__ == '__main__':
    main()
