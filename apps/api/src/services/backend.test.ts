import { describe, expect, it } from 'vitest';
import type { ExtractedProduct, ReferenceLookupResult } from '@counterfeitiq/shared';
import { compareProduct } from './compare';
import { assessPackageExpiry, assessRegistrationExpiry } from './expiry';
import { buildInvestigation } from './investigation';
import {
  normalizeManufacturer,
  normalizeNafdacNumber,
  normalizeProductName,
  normalizeStrength,
} from './normalize';

const extracted: ExtractedProduct = {
  category: 'medicine', productName: 'Example Medicine', brand: null,
  nafdacNumber: 'A1-123456', manufacturer: 'Example Pharma Ltd.', strength: '500 mg',
  ingredients: ['Example ingredient'], batchNumber: null, manufacturingDate: null, expiryDate: '2027-06',
};

const liveFound: ReferenceLookupResult = {
  status: 'FOUND',
  record: {
    productName: 'example medicine', nafdacNumber: 'A1 123456', manufacturer: 'Example Pharma Ltd',
    strength: '500mg', ingredients: ['example ingredient'], registrationExpiry: '2028-12-31',
    retrievedAt: '2026-10-31T00:00:00.000Z',
  },
  provenance: {
    source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true,
    requestedAt: '2026-10-31T00:00:00.000Z',
  },
};

describe('normalization', () => {
  it('normalizes case and whitespace without erasing dosage differences', () => {
    expect(normalizeProductName(' Example   Medicine ')).toBe('example medicine');
    expect(normalizeManufacturer('Example Pharma Ltd.')).toBe('example pharma ltd');
    expect(normalizeNafdacNumber('a1- 123456')).toBe('A1123456');
    expect(normalizeStrength('500 MG')).toBe('500mg');
    expect(normalizeStrength('500 mg')).not.toBe(normalizeStrength('250 mg'));
  });

  it('preserves decimal strength and canonicalizes thousands and micrograms', () => {
    expect(normalizeStrength('0.5 mg')).toBe('0.5mg');
    expect(normalizeStrength('2.5 mg / 5 ml')).toBe('2.5mg/5ml');
    expect(normalizeStrength('1,000 mg')).toBe(normalizeStrength('1000 mg'));
    expect(normalizeStrength('500 mcg')).toBe(normalizeStrength('500 µg'));
    expect(normalizeStrength('500 μg')).toBe(normalizeStrength('500 µg'));
  });
});

describe('comparison', () => {
  it('returns field evidence and keeps missing fields unknown', () => {
    const findings = compareProduct({ ...extracted, manufacturer: null }, liveFound.status === 'FOUND' ? liveFound.record : never());
    expect(findings.find((finding) => finding.field === 'manufacturer')?.status).toBe('UNKNOWN');
    expect(findings.find((finding) => finding.field === 'strength')?.status).toBe('MATCH');
  });

  it('detects clinically meaningful strength differences', () => {
    const findings = compareProduct({ ...extracted, strength: '250 mg' }, liveFound.status === 'FOUND' ? liveFound.record : never());
    expect(findings.find((finding) => finding.field === 'strength')).toMatchObject({ status: 'MISMATCH', severity: 'HIGH' });
  });
});

describe('expiry', () => {
  const now = new Date('2026-10-31T12:00:00.000Z');
  it('treats month-only dates as expiring at month end', () => {
    expect(assessPackageExpiry('2026-10', now)).toBe('NOT_EXPIRED');
    expect(assessPackageExpiry('2026-09', now)).toBe('EXPIRED');
  });
  it('keeps invalid values unknown and registration expiry separate', () => {
    expect(assessPackageExpiry('2026-02-31', now)).toBe('UNKNOWN');
    expect(assessRegistrationExpiry('2025-12-31', now)).toBe('EXPIRED');
  });
});

describe('investigation status', () => {
  const now = new Date('2026-10-31T12:00:00.000Z');
  it('does not classify a missing number as not found', () => {
    expect(buildInvestigation({ ...extracted, nafdacNumber: null }, null, now).status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('does not claim Greenbook coverage for non-medicines', () => {
    const report = buildInvestigation({ ...extracted, category: 'food' }, null, now);
    expect(report.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(report.categoryVerificationSupported).toBe(false);
  });
  it('distinguishes authoritative not-found and unavailable', () => {
    const notFound: ReferenceLookupResult = {
      status: 'NOT_FOUND', record: null,
      provenance: { source: 'NAFDAC_GREENBOOK', mode: 'LIVE_OFFICIAL', authoritative: true, requestedAt: now.toISOString() },
    };
    const unavailable: ReferenceLookupResult = {
      status: 'SOURCE_UNAVAILABLE', record: null,
      provenance: { source: 'DEMO_FIXTURE', mode: 'DEMO_FIXTURE', authoritative: false, requestedAt: now.toISOString() },
    };
    expect(buildInvestigation(extracted, notFound, now).status).toBe('RECORD_NOT_FOUND');
    expect(buildInvestigation(extracted, unavailable, now).status).toBe('REFERENCE_UNAVAILABLE');
  });
  it('never confirms physical authenticity for matching details', () => {
    const report = buildInvestigation(extracted, liveFound, now);
    expect(report.status).toBe('REGISTRATION_DETAILS_MATCH');
    expect(report.physicalAuthenticityConfirmed).toBe(false);
  });

  it('warns separately about expired package and registration dates even when details match', () => {
    const expiredReference: ReferenceLookupResult = liveFound.status === 'FOUND'
      ? { ...liveFound, record: { ...liveFound.record, registrationExpiry: '2025-12-31' } }
      : never();
    const report = buildInvestigation({ ...extracted, expiryDate: '2025-12' }, expiredReference, now);
    expect(report.status).toBe('REGISTRATION_DETAILS_MATCH');
    expect(report.summary).toContain('printed package expiry has passed');
    expect(report.summary).toContain('regulatory registration expiry');
    expect(report.recommendedActions).toHaveLength(3);
  });
});

function never(): never { throw new Error('Unexpected union member'); }
