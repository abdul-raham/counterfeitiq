// Every company, product, batch and pack here is fictional. This is not a NAFDAC
// record or a real manufacturer's data. GTINs use the GS1 restricted-circulation
// range (prefix 200), which is not assigned to trade items, and registration
// numbers use the DEMO- prefix, which cannot be a real NAFDAC number.

export const AS_OF = '2026-10-31T00:00:00.000Z';

export function gtin14(base: string): string {
  const digits = base.padStart(13, '0');
  const sum = [...digits].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return `${digits}${(10 - (sum % 10)) % 10}`;
}

export interface SeedItem {
  gtin: string;
  description: string;
  brand: string | null;
  company: string | null;
  nafdac_reg: string | null;
  strength: string | null;
  form: string | null;
  actives: string[];
  category: string | null;
  pack_size: string | null;
}

export interface SeedLot {
  gtin: string;
  lot_no: string;
  mfg_date: string | null;
  exp_date: string | null;
  lot_status: 'released' | 'quarantine' | 'recalled' | null;
}

export interface SeedPack {
  gtin: string;
  serial: string;
  lot_no: string | null;
  pack_state: 'in_market' | 'blocked' | null;
}

const FICTIONAL_LABS = 'Fictional Labs Nigeria Ltd';
const IMAGINARY = 'Imaginary Pharmaceuticals Plc';
const SAMPLE = 'Sample Remedies Ltd';
const SPRINGS = 'Imaginary Springs Ltd';

export const GTINS = {
  demozol500: gtin14('200000000101'),
  demozol250: gtin14('200000000102'),
  coughex: gtin14('200000000103'),
  placebrin: gtin14('200000000201'),
  placebrinJunior: gtin14('200000000202'),
  examplin: gtin14('200000000301'),
  examplinCream: gtin14('200000000302'),
  demowater: gtin14('200000000401'),
  unlisted: gtin14('200000000999'),
};

const item = (
  gtin: string, description: string, company: string | null, nafdac_reg: string | null,
  strength: string | null, form: string | null, actives: string[], pack_size: string | null, category = 'medicine',
): SeedItem => ({ gtin, description, brand: description.split(' ')[0] ?? null, company, nafdac_reg, strength, form, actives, category, pack_size });

export const ITEMS: SeedItem[] = [
  item(GTINS.demozol500, 'Demozol 500 mg Tablets', FICTIONAL_LABS, 'DEMO-0101', '500 mg', 'Tablet', ['Demozolamine'], '20 tablets'),
  // Ordinary GTIN only: no batches or packs are indexed for this product.
  item(GTINS.demozol250, 'Demozol 250 mg Tablets', FICTIONAL_LABS, 'DEMO-0102', '250 mg', 'Tablet', ['Demozolamine'], '20 tablets'),
  item(GTINS.coughex, 'Coughex Syrup', FICTIONAL_LABS, null, '10 mg/5 ml', 'Syrup', ['Coughexine'], '100 ml bottle'),
  item(GTINS.placebrin, 'Placebrin Syrup', IMAGINARY, 'DEMO-0201', '125 mg/5 ml', 'Syrup', ['Placebrinate'], '100 ml bottle'),
  // Incomplete record: most reference data is missing.
  item(GTINS.placebrinJunior, 'Placebrin Junior', null, null, null, null, [], null),
  item(GTINS.examplin, 'Examplin 100 mg Capsules', SAMPLE, 'DEMO-0301', '100 mg', 'Capsule', ['Exampline'], '30 capsules'),
  item(GTINS.examplinCream, 'Examplin Cream', SAMPLE, 'DEMO-0302', '1%', 'Cream', ['Exampline'], '30 g tube'),
  item(GTINS.demowater, 'Demowater Table Water 75 cl', SPRINGS, 'DEMO-0401', null, 'Bottled water', [], '12 x 75 cl bottles', 'food and drink'),
];

export const LOTS: SeedLot[] = [
  { gtin: GTINS.demozol500, lot_no: 'DX2041', mfg_date: '2026-02-01', exp_date: '2028-01-31', lot_status: 'released' },
  { gtin: GTINS.demozol500, lot_no: 'DX2042', mfg_date: '2026-03-01', exp_date: '2028-02-29', lot_status: 'recalled' },
  { gtin: GTINS.demozol500, lot_no: 'DX1999', mfg_date: '2023-01-01', exp_date: '2025-01-31', lot_status: 'released' },
  { gtin: GTINS.placebrin, lot_no: 'PB7730', mfg_date: '2026-03-01', exp_date: '2028-02-29', lot_status: 'released' },
  { gtin: GTINS.placebrin, lot_no: 'PB7731', mfg_date: null, exp_date: null, lot_status: null },
  { gtin: GTINS.examplin, lot_no: 'EX5001', mfg_date: '2026-05-01', exp_date: '2028-04-30', lot_status: 'quarantine' },
  { gtin: GTINS.examplin, lot_no: 'EX5002', mfg_date: '2026-06-01', exp_date: '2028-05-31', lot_status: 'released' },
  { gtin: GTINS.demowater, lot_no: 'WT3001', mfg_date: '2026-09-01', exp_date: '2027-09-30', lot_status: 'released' },
];

export const PACKS: SeedPack[] = [
  { gtin: GTINS.demozol500, serial: 'DEMOSN0001', lot_no: 'DX2041', pack_state: 'in_market' },
  { gtin: GTINS.demozol500, serial: 'DEMOSN0002', lot_no: 'DX2041', pack_state: 'in_market' },
  { gtin: GTINS.demozol500, serial: 'DEMOSN0003', lot_no: 'DX2042', pack_state: 'blocked' },
  { gtin: GTINS.examplin, serial: 'DEMOSN1001', lot_no: 'EX5002', pack_state: 'in_market' },
  { gtin: GTINS.examplin, serial: 'DEMOSN1002', lot_no: null, pack_state: null },
  { gtin: GTINS.demowater, serial: 'DEMOWT0001', lot_no: 'WT3001', pack_state: 'in_market' },
];
