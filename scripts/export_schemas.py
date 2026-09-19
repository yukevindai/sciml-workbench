"""Export contracts/OpenAPI deterministically; --check never changes files."""

import argparse
import json
import tempfile
from pathlib import Path

from pydantic import TypeAdapter
from workbench.contract_registry import LEGACY_MODELS, NEW_ARTIFACT_MODELS
from workbench.schema_catalog import BASE_URI, CATALOG_TYPES, HTTP_RESPONSE_TYPES, RECORD_TYPES, catalog_schema

ROOT = Path(__file__).resolve().parents[1]
DIALECT = "https://json-schema.org/draft/2020-12/schema"


def encoded(value):
    return json.dumps(value, indent=2, ensure_ascii=True, allow_nan=False) + "\n"


def exports():
    files = {}
    for model in (*LEGACY_MODELS, *NEW_ARTIFACT_MODELS):
        major = model.model_fields["schema_version"].default.split(".")[0]
        kind = model.model_fields["kind"].default
        path = f"v{major}/{kind}.json"
        schema = model.model_json_schema()
        schema.update({"$schema": DIALECT, "$id": f"{BASE_URI}/{path}"})
        files[f"contracts/{path}"] = encoded(schema)
    for name, model in RECORD_TYPES.items():
        path = f"records/v1/{name}.json"
        schema = TypeAdapter(model).json_schema()
        schema.update({"$schema": DIALECT, "$id": f"{BASE_URI}/{path}"})
        files[f"contracts/{path}"] = encoded(schema)

    refs, schema = catalog_schema()
    definitions = schema["$defs"]
    for name in CATALOG_TYPES:
        ref = refs[name, "validation"]
        if ref != {"$ref": f"#/$defs/{name}"}:
            if name in definitions:
                raise ValueError(f"Duplicate catalog name: {name}")
            definitions[name] = ref
    schema.update({
        "$schema": DIALECT, "$id": f"{BASE_URI}/catalog.json", "title": "WorkbenchContract",
        "anyOf": [{"$ref": f"#/$defs/{name}"} for name in CATALOG_TYPES],
    })
    files["contracts/catalog.json"] = encoded(schema)

    response_refs, responses = TypeAdapter.json_schemas([
        (name, "serialization", TypeAdapter(model)) for name, model in HTTP_RESPONSE_TYPES.items()
    ])
    for name in HTTP_RESPONSE_TYPES:
        ref = response_refs[name, "serialization"]
        if ref != {"$ref": f"#/$defs/{name}"}:
            responses["$defs"][name] = ref
    responses.update({"$schema": DIALECT, "$id": f"{BASE_URI}/http-responses.json",
                      "title": "HttpResponse", "anyOf": [{"$ref": f"#/$defs/{name}"} for name in HTTP_RESPONSE_TYPES]})
    files["contracts/http-responses.json"] = encoded(responses)

    # Construct metadata only. No DB connection, provisioning, worker or provider call.
    from workbench.api import create_app
    from workbench.config import Settings

    with tempfile.TemporaryDirectory() as temporary:
        app = create_app(Settings(
            _env_file=None, database_url="sqlite://", storage_root=Path(temporary),
            api_token="schema-generation-placeholder-not-a-secret",
            efm_password="schema-generation-placeholder",
        ))
        try:
            files["contracts/openapi.json"] = encoded(app.openapi())
        finally:
            app.state.db.engine.dispose()
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail on missing, stale or unexpected schema files")
    args = parser.parse_args()
    expected = exports()
    stale = []
    for relative, content in expected.items():
        path = ROOT / relative
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(relative)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    unexpected = {p.relative_to(ROOT).as_posix() for p in (ROOT / "contracts").rglob("*.json")} - expected.keys()
    if stale or unexpected:
        raise SystemExit("Contract drift: " + ", ".join(sorted(set(stale) | unexpected)))
    print(f"{'Checked' if args.check else 'Exported'} {len(expected)} schema/OpenAPI files")


if __name__ == "__main__":
    main()
