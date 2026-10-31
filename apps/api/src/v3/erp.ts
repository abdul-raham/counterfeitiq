import type { BatchInfo, ManufacturerInfo, PackInfo, ProductInfo, SourceType } from '@counterfeitiq/shared/v3';

export class ErpUnavailableError extends Error {
  constructor() {
    super('The manufacturer system could not be reached');
    this.name = 'ErpUnavailableError';
  }
}

export interface ErpRecord {
  product: ProductInfo;
  manufacturer: ManufacturerInfo;
  batches: Record<string, BatchInfo>;
  /** Keyed by serial number, with the batch each pack belongs to. */
  packs: Record<string, PackInfo & { batchNumber: string }>;
}

/** What any manufacturer ERP integration provides. A real one replaces the simulated adapter. */
export interface ErpAdapter {
  sourceType: SourceType;
  sourceName: string;
  /** Null means the source answered and has no such product. Throws if it cannot answer. */
  findByGtin(gtin: string): Promise<ErpRecord | null>;
}

const product = (name: string, brand: string, strength: string, dosageForm: string, activeIngredients: string[], packSize: string): ProductInfo => ({
  name, brand, strength, dosageForm, activeIngredients, packSize, nafdacNumber: null, description: null,
});

// Fictional companies and products. The GTINs use GS1's 200-299 restricted-circulation range,
// which is not allocated to products on general sale, and no NAFDAC numbers are invented.
const CATALOGUE: Record<string, ErpRecord> = {
  '02000000000015': {
    product: product('Zenoril 500 mg Tablets', 'Zenoril', '500 mg', 'Tablet', ['Zenorilol'], '2 x 10 tablets'),
    manufacturer: { name: 'Zenora Pharma Ltd', country: 'Nigeria', website: null },
    batches: {
      ZEN2401: { batchNumber: 'ZEN2401', manufacturingDate: '2026-01-15', expiryDate: '2028-06-30', status: 'Released' },
      ZEN2302: { batchNumber: 'ZEN2302', manufacturingDate: '2023-02-01', expiryDate: '2025-01-31', status: 'Released' },
      ZEN2403: { batchNumber: 'ZEN2403', manufacturingDate: '2026-03-01', expiryDate: '2028-03-31', status: 'Recalled' },
    },
    packs: {
      SN0001: { serialNumber: 'SN0001', status: 'In distribution', batchNumber: 'ZEN2401' },
      SN0002: { serialNumber: 'SN0002', status: 'In distribution', batchNumber: 'ZEN2302' },
      SN0003: { serialNumber: 'SN0003', status: 'In distribution', batchNumber: 'ZEN2403' },
    },
  },
  '02000000000022': {
    product: product('Kairomox 250 mg/5 mL Suspension', 'Kairomox', '250 mg/5 mL', 'Oral suspension', ['Kairomoxin'], '100 mL bottle'),
    manufacturer: { name: 'Kairo Biolabs Ltd', country: 'Ghana', website: null },
    batches: { KAI2501: { batchNumber: 'KAI2501', manufacturingDate: '2026-04-10', expiryDate: '2028-04-30', status: 'Released' } },
    packs: { KB0001: { serialNumber: 'KB0001', status: 'In distribution', batchNumber: 'KAI2501' } },
  },
};

/** Stands in for a manufacturer whose system is down, so the demo can show that state honestly. */
const OFFLINE_GTIN = '02000000000039';

export const simulatedErp: ErpAdapter = {
  sourceType: 'DEMO_ERP',
  sourceName: 'Simulated manufacturer ERP',
  async findByGtin(gtin) {
    if (gtin === OFFLINE_GTIN) throw new ErpUnavailableError();
    return CATALOGUE[gtin] ?? null;
  },
};
