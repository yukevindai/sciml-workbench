"""The handoff inventory must reject mixed releases and detect schema drift."""
import importlib.util
from pathlib import Path
import shutil

import pytest

spec = importlib.util.spec_from_file_location('release_manifest', Path(__file__).resolve().parents[2] / 'scripts/release_manifest.py')
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)


@pytest.fixture
def checkout(tmp_path):
    original = manifest.inventory()
    for name in [*original['files_sha256_lf'], '.python-version', 'backend/workbench/services.py']:
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(manifest.ROOT / name, target)
    return tmp_path


@pytest.mark.parametrize('name,old,new', [
    ('frontend/package.json', '"version": "0.1.0"', '"version": "9.0.0"'),
    ('backend/constraints.txt', 'langgraph==1.2.11', 'langgraph==0.0.1'),
    ('.python-version', '3.12', '3.13'),
    ('frontend/Dockerfile', 'FROM node:22-alpine AS build', 'FROM node:20-alpine AS build'),
])
def test_mixed_versions_rejected(checkout, name, old, new):
    path = checkout / name
    assert old in path.read_text()
    path.write_text(path.read_text().replace(old, new))
    with pytest.raises(ValueError):
        manifest.inventory(checkout)


def test_inventory_detects_schema_change_and_ignores_line_endings(checkout):
    before = manifest.inventory(checkout)
    schema = checkout / 'contracts/v1/dataset.json'
    schema.write_bytes(schema.read_bytes().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n'))
    assert manifest.inventory(checkout) == before
    schema.write_text(schema.read_text() + '\n')
    assert manifest.inventory(checkout) != before
