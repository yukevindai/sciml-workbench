"""Build and replay a real synthetic report in a new directory; no database/provider IO."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    subprocess.run([sys.executable, str(ROOT / 'scripts/check_scientific_surface.py')], cwd=ROOT, check=True)
    from workbench import adapters
    from workbench.archive import environment, verify_archive
    from workbench.contracts import Audit, Benchmark, BenchmarkInput, Dataset, Source, Split
    from workbench.replay import replay
    from workbench.services import report_bundle, software
    from workbench.storage import LocalStore
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    example = lambda name: json.loads((ROOT / 'examples' / (name + '.json')).read_text())
    raw = (ROOT / 'examples/demo.csv').read_bytes()
    store = LocalStore(output / 'store')
    frame = adapters.frame(raw)
    data = Dataset(project_id='release-example', filename='demo.csv', blob_key=store.put(raw),
        sha256=hashlib.sha256(raw).hexdigest(), rows=len(frame), columns=list(frame), source=Source(**example('source')))
    config = example('audit')
    audit = Audit(project_id=data.project_id, dataset_id=data.id, parents=[data.id], config=config,
        result=adapters.run_audit(raw, config).result.model_dump(mode='json'))
    assignments, diagnostics = adapters.run_split(raw, example('split'))
    part = Split(project_id=data.project_id, dataset_id=data.id, audit_id=audit.id,
        parents=[data.id, audit.id], config=example('split'), assignments=assignments, result=diagnostics)
    request = BenchmarkInput(**{**example('benchmark'), 'dataset_id': data.id, 'split_id': part.id})
    result, bundle = adapters.run_benchmark(raw, data, part, request, config)
    benchmark = Benchmark(project_id=data.project_id, dataset_id=data.id, split_id=part.id,
        parents=[data.id, part.id], model=request.model, seed=request.seed,
        config=request.model_dump(mode='json'), status='succeeded', result=result, bundle_key=store.put(bundle))
    for artifact in (data, audit, part, benchmark):
        artifact.software = software()
    snapshot = {'schema_version': '1.0', 'project': {'id': data.project_id,
        'name': 'Synthetic release example', 'description': 'Bundled demo only; no scientific generalization claim.'},
        'jobs': [], 'materials': [], 'environment': environment(),
        'artifacts': [a.model_dump(mode='json') for a in (data, audit, part, benchmark)]}
    archive, _ = report_bundle(snapshot, store)
    verify_archive(io.BytesIO(archive))
    path = output / 'report.zip'
    path.write_bytes(archive)
    replay(path, output / 'replayed')
    comparison = json.loads((output / 'replayed/replay-comparison.json').read_text())
    if comparison['status'] != 'matched':
        raise SystemExit('Example scientific replay did not match')
    receipt = {'archive_sha256': hashlib.sha256(archive).hexdigest(),
        'input_sha256': data.sha256, 'structural_verification': 'passed', 'scientific_replay': comparison,
        'limitations': ['Real adapters on synthetic inputs, not a queued or autonomous research run.',
                        'No model provider, PDF extraction, Failure Memory import or hosted acceptance.']}
    (output / 'verification.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('Example report built, structurally verified and scientifically replayed')


if __name__ == '__main__':
    main()
