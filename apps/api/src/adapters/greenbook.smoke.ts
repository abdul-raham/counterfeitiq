import { expect, it } from 'vitest';
import { createReferenceAdapter } from './reference';

declare const process: { env: Record<string, string | undefined> };

const TEST_NUMBER = 'A6-100103';

// One real request. Run it only once docs/greenbook-access.md records NAFDAC's permission.
it(`finds ${TEST_NUMBER} in the live Greenbook`, async () => {
  const approval = process.env.GREENBOOK_ACCESS_BASIS?.trim();
  if (!approval) throw new Error('Refusing to contact the Greenbook: GREENBOOK_ACCESS_BASIS is not set.');

  const adapter = createReferenceAdapter({ mode: 'authorized_live', greenbookAccessBasis: approval });
  const result = await adapter.lookupMedicine(TEST_NUMBER);

  console.log('greenbook smoke:', result.status, result.provenance.mode, result.provenance.note ?? '');
  expect(result).toMatchObject({
    status: 'FOUND',
    record: { nafdacNumber: TEST_NUMBER },
    provenance: { source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true },
  });
});
