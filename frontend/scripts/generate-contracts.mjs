import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const root = new URL('../../', import.meta.url);
const output = new URL('frontend/app/lib/generated/', root);
const check = process.argv.includes('--check');
const banner = '/* Generated from Pydantic JSON schemas. Do not edit; run npm run contracts:generate. */';
const files = new Map();

for (const [source, target] of [['catalog.json', 'contracts.ts'], ['http-responses.json', 'http.ts']]) {
  const schema = JSON.parse(await readFile(new URL(`contracts/${source}`, root), 'utf8'));
  files.set(target, await compile(schema, schema.title, {
    bannerComment: banner, unknownAny: true, ignoreMinAndMaxItems: true,
    style: { singleQuote: true, semi: true },
    $refOptions: { resolve: { file: false, http: false } },
  }));
}

const responses = JSON.parse(await readFile(new URL('contracts/http-responses.json', root), 'utf8'));
const ajv = new Ajv2020({ strict: true, code: { source: true, lines: true }, allErrors: false });
// Pydantic's OpenAPI discriminator is an annotation; oneOf enforces the union.
ajv.addKeyword('discriminator');
addFormats(ajv);
ajv.addSchema(responses);
const names = ['ProjectResponse', 'ProjectsResponse', 'LegacyJobResponse', 'JobsResponse', 'LegacyArtifact', 'IntakeArtifact', 'MaterialResponse', 'ArtifactsResponse', 'ArtifactPreviews', 'Capabilities', 'JobDetail', 'JobPage', 'ArtifactPage', 'EvaluationStatusView', 'EvaluationView', 'ResearchRun', 'ResearchRuns', 'RunDetail', 'RunResult', 'RunEvents'];
const validators = Object.fromEntries(names.map(name => [`validate${name}`, `${responses.$id}#/$defs/${name}`]));
files.set('validators.cjs', banner + '\n' + standaloneCode(ajv, validators).trimEnd() + '\n');
files.set('validators.d.cts', banner + '\n' +
  `import type { ${names.join(', ')} } from './http';\n` +
  names.map(name => `export function validate${name}(value: unknown): value is ${name};`).join('\n') + '\n');

if (!check) await mkdir(output, { recursive: true });
const stale = [];
for (const [name, content] of files) {
  const path = new URL(name, output);
  if (check) {
    const actual = await readFile(path, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (actual?.replace(/\r\n/g, '\n') !== content) stale.push(fileURLToPath(path));
  } else await writeFile(path, content, 'utf8');
}
if (stale.length) throw new Error(`Generated contract drift: ${stale.join(', ')}`);
console.log(`${check ? 'Checked' : 'Generated'} ${files.size} frontend contract files`);
