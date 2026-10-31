/** Neutral facts about one pack. No threshold or decision: the rescan policy is undecided. */
export interface ScanSignal {
  totalScans: number;
  /** A lower bound: a person can clear the value, and it is capped at MAX_DEVICES. */
  distinctDevices: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ScanStore {
  record(packKey: string, deviceKey: string | null, at: string): Promise<ScanSignal>;
}

export const MAX_DEVICES = 50;

export interface ScanState extends ScanSignal {
  devices: string[];
}

export function nextScanState(state: ScanState | undefined, deviceKey: string | null, at: string): ScanState {
  const devices = state?.devices ?? [];
  const known = deviceKey === null || devices.includes(deviceKey) || devices.length >= MAX_DEVICES;
  const nextDevices = known ? devices : [...devices, deviceKey];
  return {
    totalScans: (state?.totalScans ?? 0) + 1,
    distinctDevices: nextDevices.length,
    firstSeenAt: state?.firstSeenAt ?? at,
    lastSeenAt: at,
    devices: nextDevices,
  };
}

export function publicSignal({ totalScans, distinctDevices, firstSeenAt, lastSeenAt }: ScanSignal): ScanSignal {
  return { totalScans, distinctDevices, firstSeenAt, lastSeenAt };
}

export function memoryScanStore(): ScanStore {
  const states = new Map<string, ScanState>();
  return {
    async record(packKey, deviceKey, at) {
      const state = nextScanState(states.get(packKey), deviceKey, at);
      states.set(packKey, state);
      return publicSignal(state);
    },
  };
}

interface ScanNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export function durableScanStore(namespace: ScanNamespace): ScanStore {
  return {
    async record(packKey, deviceKey, at) {
      const response = await namespace.get(namespace.idFromName(packKey)).fetch('https://scan-history/record', {
        method: 'POST',
        body: JSON.stringify({ deviceKey, at }),
      });
      if (!response.ok) throw new Error('scan history unavailable');
      return response.json() as Promise<ScanSignal>;
    },
  };
}

export async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
