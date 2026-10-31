import { isMedicineCategory, type MedicineReference } from '@counterfeitiq/shared';
import { notExecuted } from '../../api/src/adapters/contract';
import { normalizeIngredient, normalizeProductName, productNamesConflict } from '../../api/src/services/normalize';
import { NOTICE, type Extraction, type MatchResponse, type ProductCandidate } from './contract';
import { compareDosageForms, compareManufacturers, compareStrengths, type Comparison } from './normalize';
import { toProvenance, type ReferenceSource } from './sources';

const MISSING_IS_NOT_FAKE = 'This is not evidence of counterfeiting.';

function compareNames(extraction: Extraction, record: MedicineReference): Comparison {
  const reference = record.productName;
  const printed = [extraction.fields.productName.value, extraction.fields.brandName.value]
    .filter((name): name is string => name !== null);
  if (!printed.length) return 'UNKNOWN';
  const same = (name: string) => normalizeProductName(name) === normalizeProductName(reference);
  return printed.some((name) => same(name) && !productNamesConflict(name, reference)) ? 'MATCH' : 'MISMATCH';
}

function compareIngredientLists(extraction: Extraction, record: MedicineReference): Comparison {
  if (!extraction.activeIngredients.length || !record.ingredients.length) return 'UNKNOWN';
  const reference = new Set(record.ingredients.map(normalizeIngredient));
  // Printed ingredients carry doses and lists can be partial, so no overlap stays UNKNOWN.
  const shared = extraction.activeIngredients.some((item) => reference.has(normalizeIngredient(item)));
  return shared ? 'MATCH' : 'UNKNOWN';
}

function assess(extraction: Extraction, record: MedicineReference, basis: ProductCandidate['basis']): ProductCandidate {
  const { fields } = extraction;
  const checks: [string, Comparison][] = [
    ['productName', compareNames(extraction, record)],
    ['manufacturer', compareManufacturers(fields.manufacturer.value, record.manufacturer)],
    ['strength', compareStrengths(fields.strength.value, record.strength)],
    ['dosageForm', compareDosageForms(fields.dosageForm.value, record.dosageForm ?? null)],
    ['ingredients', compareIngredientLists(extraction, record)],
  ];
  const having = (status: Comparison) => checks.filter(([, result]) => result === status).map(([name]) => name);
  const conflictingFields = having('MISMATCH');
  return {
    record,
    basis,
    matchedFields: having('MATCH'),
    conflictingFields,
    unknownFields: having('UNKNOWN'),
    explanation: basis === 'REGISTRATION_NUMBER'
      ? 'The record has exactly the registration number read from the pack.'
      : `No registration number was used. This record is a possible match by name${conflictingFields.length ? `, but differs on ${conflictingFields.join(', ')}` : ''}.`,
  };
}

export async function matchProduct(extraction: Extraction, source: ReferenceSource): Promise<MatchResponse> {
  if (extraction.category !== null && !isMedicineCategory(extraction.category)) {
    return {
      outcome: 'NOT_APPLICABLE', candidates: [], notice: NOTICE,
      explanation: 'This product category is not covered by the medicine reference.',
      provenance: toProvenance(notExecuted('No reference applies to this category.')),
    };
  }

  const number = extraction.fields.nafdacNumber.value;
  if (number) {
    const lookup = await source.lookup(number);
    const provenance = toProvenance(lookup);
    if (lookup.status === 'FOUND') {
      return {
        outcome: 'REGISTRATION_NUMBER_FOUND', notice: NOTICE, provenance,
        candidates: [assess(extraction, lookup.record, 'REGISTRATION_NUMBER')],
        explanation: 'One record has this registration number. A registration record describes a product, not this batch or pack.',
      };
    }
    if (lookup.status === 'NOT_FOUND') {
      return {
        outcome: 'REGISTRATION_NOT_FOUND', candidates: [], notice: NOTICE, provenance,
        explanation: `The source has no record with this number. The number may have been misread. ${MISSING_IS_NOT_FAKE}`,
      };
    }
    return {
      outcome: provenance.category === 'NO_SOURCE' ? 'NO_SOURCE' : 'SOURCE_UNAVAILABLE',
      candidates: [], notice: NOTICE, provenance,
      explanation: `The reference could not answer for this number. ${MISSING_IS_NOT_FAKE}`,
    };
  }

  const result = await source.search({
    productName: extraction.fields.productName.value,
    brandName: extraction.fields.brandName.value,
  });
  if (!result.supported) {
    return {
      outcome: 'NO_SOURCE', candidates: [], notice: NOTICE, provenance: result.provenance,
      explanation: `No registration number was read, and this source can only be searched by number. ${MISSING_IS_NOT_FAKE}`,
    };
  }

  const assessed = result.records.map((record) => assess(extraction, record, 'PRODUCT_ATTRIBUTES'));
  const compatible = assessed.filter((candidate) => !candidate.conflictingFields.includes('strength'));
  const candidates = (compatible.length ? compatible : assessed).sort((a, b) =>
    a.conflictingFields.length - b.conflictingFields.length || b.matchedFields.length - a.matchedFields.length);

  if (!candidates.length) {
    return {
      outcome: 'NO_CANDIDATES', candidates, notice: NOTICE, provenance: result.provenance,
      explanation: `No record matched the printed product name. ${MISSING_IS_NOT_FAKE}`,
    };
  }
  if (candidates.length > 1) {
    return {
      outcome: 'MULTIPLE_CANDIDATES', candidates, notice: NOTICE, provenance: result.provenance,
      explanation: 'Several records fit what could be read. The pack details cannot tell them apart, so none was chosen.',
    };
  }
  return {
    outcome: 'SINGLE_CANDIDATE', candidates, notice: NOTICE, provenance: result.provenance,
    explanation: 'One record fits what could be read, but no registration number confirms it.',
  };
}
