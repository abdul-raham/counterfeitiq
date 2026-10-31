import type { IdentityLevel, ScanSummary } from '@counterfeitiq/shared/v3';

export interface ScanEvent {
  /** GTIN, plus batch or serial where the code has them. */
  identifier: string;
  level: IdentityLevel;
  occurredAt: string;
  anonymousSessionId: string | null;
}

const MAX_EVENTS = 500;
const MAX_TRACKED_PACKS = 2000;

export const PERSISTENCE_NOTE = 'Counts are kept in temporary memory for this demo, so they can reset or miss scans handled elsewhere.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Temporary, per-Worker-instance storage. It holds no IP addresses or personal details. It is
 * reset whenever the instance restarts and is not shared between instances, so it can undercount.
 */
export class ScanEventStore {
  private events: ScanEvent[] = [];
  private packs = new Map<string, { count: number; firstScannedAt: string }>();

  record(event: Omit<ScanEvent, 'anonymousSessionId'> & { anonymousSessionId: unknown }): ScanSummary | null {
    const session = typeof event.anonymousSessionId === 'string' && UUID.test(event.anonymousSessionId) ? event.anonymousSessionId : null;
    this.events.push({ ...event, anonymousSessionId: session });
    if (this.events.length > MAX_EVENTS) this.events.shift();

    // Repeats mean nothing for a shared barcode: every pack of a product carries the same one.
    if (event.level !== 'PACK') return null;

    const seen = this.packs.get(event.identifier);
    const summary: ScanSummary = {
      previousScans: seen?.count ?? 0,
      firstScannedAt: seen?.firstScannedAt ?? null,
      persistenceNote: PERSISTENCE_NOTE,
    };
    if (!seen && this.packs.size >= MAX_TRACKED_PACKS) {
      const oldest = this.packs.keys().next().value;
      if (oldest !== undefined) this.packs.delete(oldest);
    }
    this.packs.set(event.identifier, { count: (seen?.count ?? 0) + 1, firstScannedAt: seen?.firstScannedAt ?? event.occurredAt });
    return summary;
  }

  get size() {
    return this.events.length;
  }

  latest(): ScanEvent | undefined {
    return this.events.at(-1);
  }
}

export const isolateScanEvents = new ScanEventStore();
