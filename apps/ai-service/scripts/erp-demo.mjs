// Runs the scan cases against the running services, over real HTTP. Uses no model.
// AI_SERVICE_URL=http://localhost:8788 AI_SERVICE_TOKEN=... npm run erp-demo -- <demozol-500-gtin>
const base = process.env.AI_SERVICE_URL ?? 'http://localhost:8788';
const headers = { Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}`, 'Content-Type': 'application/json' };
const gtin = process.argv[2];

async function scan(label, identifier) {
  const started = Date.now();
  const response = await fetch(`${base}/resolve-identifier`, {
    method: 'POST', headers, body: JSON.stringify({ identifier, deviceId: 'demo-device-value' }),
  });
  const report = await response.json();
  console.log(label.padEnd(20), `${Date.now() - started}ms`.padEnd(7), report.outcome, report.identityLevel,
    report.product?.productName ?? '-', '| batch', report.batch?.status ?? '-', '| pack', report.pack?.status ?? '-', '|',
    report.warnings.map((warning) => warning.code).join(',') || 'no warnings', '|',
    report.scanSignal ? `scans=${report.scanSignal.totalScans}` : 'no signal', '|',
    report.sources[0]?.sourceType, `demo=${report.sources[0]?.isDemo}`);
}

console.log(JSON.stringify(await (await fetch(`${base}/source-status`, { headers })).json()));
await scan('product-level GTIN', gtin);
await scan('serialized pack', `(01)${gtin}(21)DEMOSN0001`);
await scan('same pack, rescan', `(01)${gtin}(21)DEMOSN0001`);
await scan('recalled batch', `(01)${gtin}(10)DX2042`);
await scan('unknown serial', `(01)${gtin}(21)NOSUCH`);
await scan('bad barcode', '12345');
