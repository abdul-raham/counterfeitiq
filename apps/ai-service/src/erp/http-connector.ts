import { z } from 'zod';
import type {
  BatchIdentity,
  BatchStatus,
  ErpConnector,
  PackIdentity,
  ProductIdentity,
  Provenance,
  RetrievalStatus,
  SourceResult,
  SourceStatus,
} from './types';

export interface HttpConnectorOptions {
  sourceName: string;
  sourceType: ErpConnector['sourceType'];
  baseUrl: string;
  token: string;
  gtinPrefixes?: string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

const text = z.string().max(300).nullable();

const itemSchema = z.object({
  gtin: z.string(), description: z.string().min(1).max(300), brand: text, company: text, nafdac_reg: text,
  strength: text, form: text, actives: z.array(z.string().max(300)).max(30), category: text, pack_size: text.optional(),
});
const lotSchema = z.object({
  gtin: z.string(), lot_no: z.string().min(1).max(40), mfg_date: text, exp_date: text, lot_status: z.string().max(40).nullable(),
});
const packSchema = z.object({
  gtin: z.string(), serial: z.string().min(1).max(40), lot_no: text, pack_state: z.string().max(40).nullable(),
});
const statusSchema = z.object({
  available: z.boolean(), capabilities: z.object({ batches: z.boolean(), packs: z.boolean() }),
});

const envelopeSchema = z.object({
  fictional: z.boolean().optional(),
  as_of: z.string().max(40).nullable().optional(),
  data: z.unknown(),
});

const BATCH_STATUSES: Record<string, BatchStatus> = { released: 'ACTIVE', quarantine: 'BLOCKED', recalled: 'RECALLED' };
const PACK_STATUSES: Record<string, PackIdentity['status']> = { in_market: 'ACTIVE', blocked: 'BLOCKED' };

function nullFields(record: object): string[] {
  return Object.entries(record)
    .filter(([, value]) => value === null || (Array.isArray(value) && value.length === 0))
    .map(([key]) => key);
}

const normalizeProduct = (item: z.infer<typeof itemSchema>): ProductIdentity => ({
  gtin: item.gtin, productName: item.description, brand: item.brand, manufacturer: item.company,
  nafdacNumber: item.nafdac_reg, strength: item.strength, dosageForm: item.form,
  ingredients: item.actives, category: item.category, packSize: item.pack_size ?? null,
});

const normalizeBatch = (lot: z.infer<typeof lotSchema>): BatchIdentity => ({
  gtin: lot.gtin, batchNumber: lot.lot_no, manufacturingDate: lot.mfg_date, expiryDate: lot.exp_date,
  status: BATCH_STATUSES[lot.lot_status ?? ''] ?? 'UNKNOWN',
});

const normalizePack = (pack: z.infer<typeof packSchema>): PackIdentity => ({
  gtin: pack.gtin, serial: pack.serial, batchNumber: pack.lot_no,
  status: PACK_STATUSES[pack.pack_state ?? ''] ?? 'UNKNOWN',
});

/** One manufacturer API over HTTP. Failures are returned as results, never thrown. */
export function createHttpConnector(options: HttpConnectorOptions): ErpConnector {
  const send = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 4_000;
  const { sourceName, sourceType } = options;
  const base = options.baseUrl.replace(/\/+$/, '');

  const provenance = (retrievalStatus: RetrievalStatus, retrievedAt: string, dataAsOf: string | null, unavailableFields: string[] = []): Provenance => ({
    sourceType, sourceName, retrievalStatus, retrievedAt, dataAsOf, isDemo: sourceType === 'SIMULATED_ERP', unavailableFields,
  });

  async function request<S extends z.ZodType, T extends object>(
    path: string, schema: S, normalize: (value: z.infer<S>) => T,
  ): Promise<SourceResult<T>> {
    const retrievedAt = now().toISOString();
    const unavailable = (): SourceResult<T> => ({ status: 'SOURCE_UNAVAILABLE', data: null, provenance: provenance('UNAVAILABLE', retrievedAt, null) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await send(`${base}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${options.token}` },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status === 404) return { status: 'NOT_FOUND', data: null, provenance: provenance('NOT_FOUND', retrievedAt, null) };
      if (response.status === 501) return { status: 'UNSUPPORTED', data: null, provenance: provenance('UNSUPPORTED', retrievedAt, null) };
      if (response.status !== 200) return unavailable();
      const envelope = envelopeSchema.safeParse(await response.json());
      if (!envelope.success) return unavailable();
      // Fictional data must never pass as a manufacturer's, or the reverse.
      if ((envelope.data.fictional === true) !== (sourceType === 'SIMULATED_ERP')) return unavailable();
      const parsed = schema.safeParse(envelope.data.data);
      if (!parsed.success) return unavailable();
      const data = normalize(parsed.data);
      return { status: 'FOUND', data, provenance: provenance('RETRIEVED', retrievedAt, envelope.data.as_of ?? null, nullFields(data)) };
    } catch {
      return unavailable();
    } finally {
      clearTimeout(timer);
    }
  }

  const segment = encodeURIComponent;

  return {
    sourceName,
    sourceType,
    gtinPrefixes: options.gtinPrefixes ?? [],
    getProduct: (gtin) => request(`/v1/products/${segment(gtin)}`, itemSchema, normalizeProduct),
    getBatch: (gtin, batchNumber) => request(`/v1/products/${segment(gtin)}/batches/${segment(batchNumber)}`, lotSchema, normalizeBatch),
    getPack: (gtin, serial) => request(`/v1/products/${segment(gtin)}/packs/${segment(serial)}`, packSchema, normalizePack),
    async getSourceStatus(): Promise<SourceStatus> {
      const result = await request('/v1/status', statusSchema, (status) => status);
      return {
        available: result.data?.available ?? false,
        capabilities: result.data?.capabilities ?? { batches: false, packs: false },
        provenance: result.provenance,
      };
    },
  };
}
