import type { ApiErrorCode, MedicineReference, VerificationFinding, VerificationStatus } from '@counterfeitiq/shared';
import { z } from 'zod';

// Local to this service, so V2 can adopt it through a contract PR without this
// service changing packages/shared on its own.

export const NOTICE = 'This output compares packaging text with reference data. It cannot show that a physical medicine is genuine or counterfeit.';

export const FIELD_NAMES = [
  'productName', 'brandName', 'manufacturer', 'nafdacNumber', 'strength', 'dosageForm',
  'batchNumber', 'manufacturingDate', 'expiryDate', 'gtin',
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

export const CATEGORIES = ['medicine', 'medical device', 'food', 'cosmetic', 'other'] as const;
export const IMAGE_QUALITIES = ['GOOD', 'POOR', 'UNREADABLE'] as const;

const shortText = z.string().max(500);

const fieldsSchema = <T extends z.ZodType>(field: T) =>
  z.strictObject(Object.fromEntries(FIELD_NAMES.map((name) => [name, field])) as Record<FieldName, T>);

/** What the model must reply with. Anything else is rejected, not repaired. */
export const modelOutputSchema = z.strictObject({
  category: z.string().max(40).nullable(),
  imageQuality: z.enum(IMAGE_QUALITIES),
  // Gemma sometimes writes a bare null for a field that is not printed. That is the
  // same statement as an object of nulls, so it is accepted and nothing else is.
  fields: fieldsSchema(z.strictObject({
    value: shortText.nullable(),
    evidence: shortText.nullable(),
    legibility: z.enum(['CLEAR', 'UNCERTAIN']).nullable(),
  }).nullable().transform((field) => field ?? { value: null, evidence: null, legibility: null })),
  activeIngredients: z.array(shortText).max(20),
  otherClaims: z.array(shortText).max(10),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

const extractedFieldSchema = z.strictObject({
  value: shortText.nullable(),
  /** The printed text the value was read from. */
  evidence: shortText.nullable(),
  /** Categorical on purpose: a model's own percentage is not calibrated. */
  legibility: z.enum(['CLEAR', 'UNCERTAIN', 'NOT_VISIBLE']),
});
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const extractionSchema = z.strictObject({
  category: z.enum(CATEGORIES).nullable(),
  imageQuality: z.enum(IMAGE_QUALITIES),
  fields: fieldsSchema(extractedFieldSchema),
  activeIngredients: z.array(shortText).max(20),
  otherClaims: z.array(shortText).max(10),
  missingFields: z.array(z.enum(FIELD_NAMES)),
  uncertainFields: z.array(z.enum(FIELD_NAMES)),
});
export type Extraction = z.infer<typeof extractionSchema>;

export const matchRequestSchema = z.strictObject({ extraction: extractionSchema });

export const compareRequestSchema = z.strictObject({
  extraction: extractionSchema,
  /** A candidate picked from /match-product. Defaults to the number read from the pack. */
  selectedNafdacNumber: z.string().min(1).max(40).optional(),
});

export type SourceCategory =
  | 'LIVE_REGULATORY_REFERENCE'
  | 'AUTHORIZED_REFERENCE_SNAPSHOT'
  | 'DEMO_FIXTURE'
  | 'NO_SOURCE'
  | 'SOURCE_UNAVAILABLE';

export interface SourceProvenance {
  category: SourceCategory;
  isDemo: boolean;
  /** Always false until NAFDAC authorizes this project. */
  officialIntegration: false;
  requestedAt: string | null;
  retrievedAt: string | null;
  sourceUrl: string | null;
  note: string | null;
}

export type MatchOutcome =
  | 'REGISTRATION_NUMBER_FOUND'
  | 'SINGLE_CANDIDATE'
  | 'MULTIPLE_CANDIDATES'
  | 'NO_CANDIDATES'
  | 'REGISTRATION_NOT_FOUND'
  | 'SOURCE_UNAVAILABLE'
  | 'NO_SOURCE'
  | 'NOT_APPLICABLE';

export interface ProductCandidate {
  record: MedicineReference;
  basis: 'REGISTRATION_NUMBER' | 'PRODUCT_ATTRIBUTES';
  matchedFields: string[];
  conflictingFields: string[];
  unknownFields: string[];
  explanation: string;
}

export interface MatchResponse {
  outcome: MatchOutcome;
  candidates: ProductCandidate[];
  explanation: string;
  provenance: SourceProvenance;
  notice: string;
}

export interface PackagingNote {
  code: string;
  severity: 'INFO' | 'WARNING';
  explanation: string;
}

export interface CompareResponse {
  status: VerificationStatus;
  findings: VerificationFinding[];
  packagingNotes: PackagingNote[];
  provenance: SourceProvenance;
  physicalAuthenticityConfirmed: false;
  notice: string;
}

export type ServiceErrorCode = ApiErrorCode | 'UNAUTHORIZED' | 'INVALID_REQUEST';
