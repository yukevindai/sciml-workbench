"""Generate/check the release compatibility inventory (Python 3.12, no service IO)."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import tomllib

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'docs/release/compatibility.json'


def digest(path):
    # Git's Windows CRLF conversion must not change source compatibility.
    return hashlib.sha256(path.read_text(encoding='utf-8').replace('\r\n', '\n').encode()).hexdigest()


def inventory(root=ROOT):
    project = tomllib.loads((root / 'backend/pyproject.toml').read_text())['project']
    frontend = json.loads((root / 'frontend/package.json').read_text())
    lock = json.loads((root / 'frontend/package-lock.json').read_text())
    api = json.loads((root / 'contracts/openapi.json').read_text())
    version = project['version']
    if not version == frontend['version'] == lock['version'] == lock['packages']['']['version']:
        raise ValueError('Frontend/backend/package-lock versions disagree')
    service = (root / 'backend/workbench/services.py').read_text()
    if f'"workbench": "{version}"' not in service:
        raise ValueError('Report software version disagrees with package version')
    migrations = {}
    for path in sorted((root / 'backend/migrations/versions').glob('*.py')):
        values = {}
        for node in ast.parse(path.read_text()).body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in {'revision', 'down_revision'}:
                        values[target.id] = ast.literal_eval(node.value)
        migrations[values['revision']] = values['down_revision']
    heads = set(migrations) - set(migrations.values())
    if len(heads) != 1:
        raise ValueError('Expected one database migration head')
    pins = {}
    runtime = {}
    for dependency in project['dependencies']:
        if ' @ git+' in dependency:
            name, source = dependency.split(' @ ', 1)
            if not re.search(r'@[0-9a-f]{40}$', source):
                raise ValueError('Unpinned scientific dependency')
            pins[name] = source
        elif dependency.startswith(('langgraph==', 'langgraph-checkpoint-postgres==')):
            name, value = dependency.split('==')
            runtime[name] = value
    constraints = (root / 'backend/constraints.txt').read_text()
    for name, value in runtime.items():
        if f'{name}=={value}' not in constraints.splitlines():
            raise ValueError('Runtime constraint disagrees with project dependency')
    python = (root / '.python-version').read_text().strip()
    backend_docker = (root / 'backend/Dockerfile').read_text()
    frontend_docker = (root / 'frontend/Dockerfile').read_text()
    if f'FROM python:{python}-' not in backend_docker:
        raise ValueError('Python pin and backend image disagree')
    node_majors = set(re.findall(r'FROM node:(\d+)', frontend_docker))
    postgres_majors = set(re.findall(r'(?:FROM|image:)\s+postgres:(\d+)', backend_docker + (root / 'compose.yaml').read_text()))
    if len(node_majors) != 1 or len(postgres_majors) != 1:
        raise ValueError('Container runtime majors disagree')
    files = [*sorted((root / 'contracts').rglob('*.json')),
             root / 'backend/constraints.txt', root / 'backend/pyproject.toml',
             root / 'frontend/package-lock.json', root / 'frontend/package.json',
             root / 'backend/Dockerfile', root / 'frontend/Dockerfile', root / 'compose.yaml',
             *sorted((root / 'backend/migrations/versions').glob('*.py'))]
    return {'format': 'workbench-release-compatibility/1', 'application_version': version,
        'api_version': api['info']['version'], 'python': python,
        'runtime': runtime, 'node_major': next(iter(node_majors)), 'postgres_major': next(iter(postgres_majors)),
        'migration_head': next(iter(heads)), 'migration_chain': migrations,
        'scientific_sources': pins, 'report_manifest_write': '2.0', 'report_manifest_read': ['1.0', '2.0'],
        'schema_files': len(list((root / 'contracts').rglob('*.json'))),
        'files_sha256_lf': {p.relative_to(root).as_posix(): digest(p) for p in files},
        'limitations': ['Source inventory, not installed-runtime or release acceptance.',
            'API, artifact, archive and application versions are independent namespaces.',
            'Pair frontend and backend from the same Git revision; never mix schema inventories.',
            'Docker tags are mutable; record resolved image digests in deployment evidence.',
            'Models, bounds, prices and policy revisions require separate operator review.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    value = inventory()
    if args.check:
        if not DESTINATION.exists() or json.loads(DESTINATION.read_text()) != value:
            raise SystemExit('Release compatibility inventory is stale; run scripts/release_manifest.py')
        print('Release compatibility inventory matches source')
    else:
        DESTINATION.parent.mkdir(parents=True, exist_ok=True)
        DESTINATION.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
