// Sends each demo pack through the running service. Every run spends real Neurons.
// AI_SERVICE_URL=http://localhost:8788 AI_SERVICE_TOKEN=... npm run demo -- [all|case,case] [output.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CASES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../samples/demo-cases');
const base = process.env.AI_SERVICE_URL ?? 'http://localhost:8788';
const headers = { Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}` };
const names = process.argv[2] && process.argv[2] !== 'all'
  ? process.argv[2].split(',')
  : ['clean', 'blurry', 'missing-registration-number', 'mismatched-strength', 'multiple-candidates', 'reference-unavailable'];

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

const results = {};
for (const name of names) {
  const form = new FormData();
  form.append('image', new File([readFileSync(resolve(CASES, `${name}.png`))], `${name}.png`, { type: 'image/png' }));
  const started = Date.now();
  const response = await fetch(`${base}/extract`, { method: 'POST', headers, body: form });
  const extracted = await response.json();
  const elapsedMs = Date.now() - started;
  if (!response.ok) {
    results[name] = { elapsedMs, extracted };
    console.log(name, response.status, extracted.error?.code);
    continue;
  }
  const match = await post('/match-product', { extraction: extracted.extraction });
  const compare = await post('/compare-packaging', { extraction: extracted.extraction });
  results[name] = { elapsedMs, extracted, match, compare };
  console.log(name, `${elapsedMs}ms`, extracted.extraction.imageQuality, extracted.extraction.fields.nafdacNumber.value,
    extracted.extraction.fields.strength.value, match.outcome, compare.status, compare.provenance.category);
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(results, null, 2));
