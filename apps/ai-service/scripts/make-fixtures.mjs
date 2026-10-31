// Draws the fictional demo packs in samples/demo-cases. Run with: npm run fixtures
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../samples/demo-cases');

const DEMOZOL = {
  name: 'DEMOZOL', strength: '500 mg', form: 'Tablets', ingredient: 'Demozolamine 500 mg',
  maker: 'Fictional Labs Nigeria Ltd', number: 'DEMO-0101', batch: 'DX2041', mfg: '2026-02', exp: '2028-01',
};

const CASES = {
  'clean': DEMOZOL,
  'blurry': { ...DEMOZOL, blur: 11 },
  'missing-registration-number': { ...DEMOZOL, number: null },
  'mismatched-strength': { ...DEMOZOL, strength: '250 mg', ingredient: 'Demozolamine 250 mg' },
  'multiple-candidates': { ...DEMOZOL, strength: null, ingredient: 'Demozolamine', number: null },
  'reference-unavailable': {
    name: 'PLACEBRIN', strength: '125 mg/5 ml', form: 'Syrup', ingredient: 'Placebrinate 125 mg/5 ml',
    maker: 'Imaginary Pharmaceuticals Plc', number: 'DEMO-0999', batch: 'PB7730', mfg: '2026-03', exp: '2028-02',
  },
};

function svg(pack) {
  const line = (y, size, text, weight = 400) =>
    `<text x="60" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="#14213d">${text}</text>`;
  const rows = [
    line(190, 84, pack.name, 700),
    line(255, 40, pack.strength ? `${pack.strength} ${pack.form}` : pack.form),
    line(320, 28, `Each dose contains: ${pack.ingredient}`),
    line(370, 28, `Manufactured by: ${pack.maker}`),
    pack.number ? line(440, 32, `NAFDAC Reg. No: ${pack.number}`, 700) : '',
    line(490, 28, `Batch: ${pack.batch}`),
    line(530, 28, `Mfg: ${pack.mfg}    Exp: ${pack.exp}`),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640">
    <rect width="900" height="640" fill="#f7f4ea"/>
    <rect width="900" height="80" fill="#b00020"/>
    <text x="60" y="52" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#ffffff">DEMO FIXTURE - FICTIONAL PRODUCT</text>
    ${rows.join('')}
    <text x="60" y="600" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#b00020">Not a real medicine. Not a NAFDAC record.</text>
  </svg>`;
}

mkdirSync(OUTPUT, { recursive: true });
for (const [name, pack] of Object.entries(CASES)) {
  let image = sharp(Buffer.from(svg(pack)));
  if (pack.blur) image = image.blur(pack.blur);
  await image.png().toFile(resolve(OUTPUT, `${name}.png`));
  console.log(`${name}.png`);
}
