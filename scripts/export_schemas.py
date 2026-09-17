from pathlib import Path
import json
from workbench import contracts as c

root = Path(__file__).resolve().parents[1] / "contracts" / "v1"
root.mkdir(parents=True, exist_ok=True)
for model in (
    c.Dataset,
    c.Audit,
    c.Split,
    c.Benchmark,
    c.Evidence,
    c.Failure,
    c.Provenance,
    c.Report,
):
    schema = model.model_json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = (
        f"https://sciml-workbench.local/contracts/v1/{model.__name__.lower()}.json"
    )
    (root / f"{model.__name__.lower()}.json").write_text(
        json.dumps(schema, indent=2) + "\n"
    )
