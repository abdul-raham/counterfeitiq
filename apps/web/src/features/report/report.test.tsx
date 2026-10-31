import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDate } from '../../lib/format';
import { analysis, fixture, foundFixture, live, notExecuted, notFound, unavailable } from '../../test/fixtures';
import { Report } from './Report';
import { buildComparisonRows, describeOutcome } from './outcome';

describe('describeOutcome', () => {
  it('never turns a match into a claim of authenticity', () => {
    const { title, caveat } = describeOutcome(analysis());
    expect(title).toBe('Registration details match');
    expect(caveat).toMatch(/does not prove this pack is genuine/);
  });

  it('names a demo fixture in the headline', () => {
    expect(describeOutcome(analysis({ reference: foundFixture })).title).toMatch(/demonstration record/);
  });

  it('does not call a missing record proof of a fake', () => {
    const outcome = describeOutcome(analysis({ reference: notFound, verification: { status: 'RECORD_NOT_FOUND' } }));
    expect(outcome.caveat).toMatch(/does not prove the product is fake/);
  });

  it('separates a missing number from a missing record', () => {
    const outcome = describeOutcome(analysis({
      extracted: { nafdacNumber: null },
      reference: null,
      verification: { status: 'INSUFFICIENT_EVIDENCE' },
    }));
    expect(outcome.title).toBe('No NAFDAC number could be read');
    expect(outcome.suggestRetake).toBe(true);
  });

  it('explains unsupported product types', () => {
    const outcome = describeOutcome(analysis({
      extracted: { category: 'cosmetic' },
      reference: null,
      verification: { status: 'INSUFFICIENT_EVIDENCE', categoryVerificationSupported: false },
    }));
    expect(outcome.title).toMatch(/not available for this product type/);
  });

  it('does not call an unread category unsupported', () => {
    const outcome = describeOutcome(analysis({
      extracted: { category: null },
      reference: null,
      verification: { status: 'INSUFFICIENT_EVIDENCE', categoryVerificationSupported: false },
    }));
    expect(outcome.title).toBe('We could not tell what type of product this is');
    expect(outcome.suggestRetake).toBe(true);
  });

  it('asks for a clearer photo when nothing was read', () => {
    const outcome = describeOutcome(analysis({
      extracted: { category: null, productName: null, nafdacNumber: null, manufacturer: null, strength: null, expiryDate: null },
      reference: null,
      verification: { status: 'INSUFFICIENT_EVIDENCE' },
    }));
    expect(outcome.suggestRetake).toBe(true);
  });
});

describe('lapsed registration', () => {
  it('does not show a green summary and says the record has expired', () => {
    const response = analysis({ verification: { registrationExpiryStatus: 'EXPIRED' } });
    expect(describeOutcome(response).tone).toBe('warn');
    render(<Report imageUrl={null} response={response} />);
    expect(screen.getByText('The expiry date on the registration record has passed')).toBeInTheDocument();
  });
});

describe('expired and unreadable packs', () => {
  it('does not show a green summary over an expired pack', () => {
    expect(describeOutcome(analysis()).tone).toBe('ok');
    expect(describeOutcome(analysis({ verification: { packageExpiryStatus: 'EXPIRED' } })).tone).toBe('warn');
  });

  it('shows the photo instead of empty fields when nothing was read', () => {
    render(<Report imageUrl="blob:test" response={analysis({
      extracted: { category: null, productName: null, nafdacNumber: null, manufacturer: null, strength: null, expiryDate: null },
      reference: null,
      verification: { status: 'INSUFFICIENT_EVIDENCE', packageExpiryStatus: 'UNKNOWN', registrationExpiryStatus: 'UNKNOWN' },
    })} />);
    expect(screen.getByAltText('The photo you scanned')).toBeInTheDocument();
    expect(screen.queryByText('Not available')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Expiry dates' })).not.toBeInTheDocument();
  });
});

describe('buildComparisonRows', () => {
  it('takes match status only from backend findings', () => {
    const rows = buildComparisonRows(analysis());
    expect(rows.every((row) => row.status === null)).toBe(true);
  });

  it('keeps findings for fields the UI does not know about', () => {
    const rows = buildComparisonRows(analysis({
      verification: {
        findings: [{
          code: 'DOSAGE_FORM_MISMATCH', field: 'dosageForm', status: 'MISMATCH', severity: 'HIGH',
          packagingValue: 'Tablet', referenceValue: 'Capsule', explanation: 'Dosage form differs.',
        }],
      },
    }));
    expect(rows.at(-1)).toMatchObject({ label: 'Dosage form', packValue: 'Tablet', status: 'MISMATCH' });
  });
});

describe('formatDate', () => {
  it('keeps month-only dates month-only', () => {
    expect(formatDate('2027-06')).toBe('June 2027');
    expect(formatDate('2028-03-14')).toBe('14 March 2028');
    expect(formatDate('06/2027')).toBe('June 2027');
  });

  it('leaves unrecognised values as printed', () => {
    expect(formatDate('JUN 27')).toBe('JUN 27');
  });
});

describe('Report', () => {
  it('shows pack expiry and registration expiry as separate values', () => {
    render(<Report imageUrl={null} response={analysis({ verification: { packageExpiryStatus: 'EXPIRED' } })} />);
    const pack = screen.getByRole('heading', { name: 'Printed pack expiry' }).parentElement as HTMLElement;
    const registration = screen.getByRole('heading', { name: 'Registration expiry' }).parentElement as HTMLElement;
    expect(within(pack).getByText('June 2027')).toBeInTheDocument();
    expect(within(pack).getByText('Date has passed')).toBeInTheDocument();
    expect(within(registration).getByText('14 March 2028')).toBeInTheDocument();
    expect(within(registration).getByText('Date has not passed')).toBeInTheDocument();
    expect(screen.getByText('The expiry date printed on this pack has passed')).toBeInTheDocument();
  });

  it('prominently labels a demo fixture', () => {
    render(<Report imageUrl={null} response={analysis({ reference: foundFixture })} />);
    expect(screen.getByText('Demonstration record, not live NAFDAC data')).toBeInTheDocument();
    expect(screen.queryByText(/live NAFDAC Greenbook/)).not.toBeInTheDocument();
    expect(screen.queryByText(/registration record/)).not.toBeInTheDocument();
  });

  it('attributes a live lookup with its date', () => {
    render(<Report imageUrl={null} response={analysis()} />);
    expect(screen.getByText(/live NAFDAC Greenbook lookup, checked 30 October 2026/)).toBeInTheDocument();
  });

  it.each([
    ['LIVE_OFFICIAL', { ...live, authoritative: false }, 'Source: the official NAFDAC source could not be reached.'],
    ['DEMO_FIXTURE', { ...fixture }, 'Source: no matching demonstration record is available and no live lookup was performed.'],
    ['NOT_EXECUTED', notExecuted, 'Source: no registration source was checked.'],
  ] as const)('words an unavailable lookup by what actually ran (%s)', (_mode, provenance, text) => {
    render(<Report imageUrl={null} response={analysis({
      reference: { status: 'SOURCE_UNAVAILABLE', record: null, provenance },
      verification: { status: 'REFERENCE_UNAVAILABLE' },
    })} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText('Demonstration record, not live NAFDAC data')).not.toBeInTheDocument();
    expect(screen.queryByText(/live NAFDAC Greenbook/)).not.toBeInTheDocument();
  });

  it('does not attribute anything to NAFDAC when the source failed', () => {
    render(<Report imageUrl={null} response={analysis({ reference: unavailable, verification: { status: 'REFERENCE_UNAVAILABLE' } })} />);
    expect(screen.getByText('Registration records could not be checked')).toBeInTheDocument();
    expect(screen.queryByText(/could not be reached/)).not.toBeInTheDocument();
    expect(screen.queryByText(/live NAFDAC/)).not.toBeInTheDocument();
  });

  it('does not announce a demonstration record when a fixture lookup failed', () => {
    render(<Report imageUrl={null} response={analysis({
      reference: { status: 'SOURCE_UNAVAILABLE', record: null, provenance: { ...fixture, authoritative: false } },
      verification: { status: 'REFERENCE_UNAVAILABLE' },
    })} />);
    expect(screen.getByText(/no matching demonstration record/)).toBeInTheDocument();
    expect(screen.queryByText('Demonstration record, not live NAFDAC data')).not.toBeInTheDocument();
  });

  it('does not imply a record exists when none was checked', () => {
    render(<Report imageUrl={null} response={analysis({ reference: null, verification: { status: 'INSUFFICIENT_EVIDENCE' } })} />);
    expect(screen.getByText('No record was checked')).toBeInTheDocument();
    expect(screen.queryByText('From the registration record')).not.toBeInTheDocument();
  });

  it('lists differences with both values', () => {
    render(<Report imageUrl={null} response={analysis({
      verification: {
        status: 'DETAILS_MISMATCH',
        findings: [{
          code: 'STRENGTH_MISMATCH', field: 'strength', status: 'MISMATCH', severity: 'HIGH',
          packagingValue: '500 mg', referenceValue: '250 mg', explanation: 'Strength differs.',
        }],
      },
    })} />);
    expect(screen.getByRole('heading', { name: 'What differs' })).toBeInTheDocument();
    const row = screen.getByRole('heading', { name: 'Strength' }).parentElement?.parentElement as HTMLElement;
    expect(within(row).getByText('500 mg')).toBeInTheDocument();
    expect(within(row).getByText('250 mg')).toBeInTheDocument();
    expect(within(row).getByText('Differs')).toBeInTheDocument();
  });

  it.each([
    ['match', analysis()],
    ['fixture', analysis({ reference: foundFixture })],
    ['not found', analysis({ reference: notFound, verification: { status: 'RECORD_NOT_FOUND' } })],
    ['unavailable', analysis({ reference: unavailable, verification: { status: 'REFERENCE_UNAVAILABLE' } })],
  ])('never renders an authenticity verdict or score (%s)', (_name, response) => {
    const { container } = render(<Report imageUrl={null} response={response} />);
    // The required caveat is the one place the word may appear, and only as a negation.
    const text = (container.textContent ?? '').replace('does not prove this pack is genuine', '');
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/\b(verified|authentic)\b/i);
    expect(text).not.toMatch(/(is|looks|appears) genuine/i);
  });
});
