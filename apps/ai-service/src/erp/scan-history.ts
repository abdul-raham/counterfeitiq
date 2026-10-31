import { DurableObject } from 'cloudflare:workers';
import { nextScanState, publicSignal, type ScanState } from './scan-store';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** One object per pack. It serializes scans, so counts are exact, and erases itself after 30 days. */
export class ScanHistory extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    const { deviceKey, at } = await request.json() as { deviceKey: string | null; at: string };
    const state = nextScanState(await this.ctx.storage.get<ScanState>('state'), deviceKey, at);
    await this.ctx.storage.put('state', state);
    await this.ctx.storage.setAlarm(Date.now() + RETENTION_MS);
    return Response.json(publicSignal(state));
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
