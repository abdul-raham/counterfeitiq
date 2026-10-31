import type { ExtractedProduct, MedicineReference, VerificationFinding } from '@counterfeitiq/shared';
import {
  normalizeIngredient,
  normalizeManufacturer,
  normalizeNafdacNumber,
  normalizeProductName,
  normalizeStrength,
} from './normalize';

type ComparableField = 'nafdacNumber' | 'productName' | 'manufacturer' | 'strength';

const fieldConfig: Record<ComparableField, {
  normalize: (value: string | null) => string | null;
  label: string;
}> = {
  nafdacNumber: { normalize: normalizeNafdacNumber, label: 'NAFDAC registration number' },
  productName: { normalize: normalizeProductName, label: 'Product name' },
  manufacturer: { normalize: normalizeManufacturer, label: 'Manufacturer' },
  strength: { normalize: normalizeStrength, label: 'Strength' },
};

function compareField(
  field: ComparableField,
  packagingValue: string | null,
  referenceValue: string | null,
): VerificationFinding {
  const { normalize, label } = fieldConfig[field];
  const packaging = normalize(packagingValue);
  const reference = normalize(referenceValue);
  if (!packaging || !reference) {
    return {
      code: `${field.toUpperCase()}_UNKNOWN`, field, status: 'UNKNOWN', severity: 'INFO',
      packagingValue, referenceValue,
      explanation: `${label} could not be compared because one or both values are unavailable.`,
    };
  }
  const matches = packaging === reference;
  return {
    code: `${field.toUpperCase()}_${matches ? 'MATCH' : 'MISMATCH'}`,
    field,
    status: matches ? 'MATCH' : 'MISMATCH',
    severity: matches ? 'INFO' : 'HIGH',
    packagingValue,
    referenceValue,
    explanation: matches
      ? `${label} matches the available reference value.`
      : `${label} differs from the available reference value.`,
  };
}

function compareIngredients(packaging: string[], reference: string[]): VerificationFinding {
  const packagingValues = [...new Set(packaging.map(normalizeIngredient).filter(Boolean))].sort();
  const referenceValues = [...new Set(reference.map(normalizeIngredient).filter(Boolean))].sort();
  if (!packagingValues.length || !referenceValues.length) {
    return {
      code: 'INGREDIENTS_UNKNOWN', field: 'ingredients', status: 'UNKNOWN', severity: 'INFO',
      packagingValue: packaging.length ? packaging.join(', ') : null,
      referenceValue: reference.length ? reference.join(', ') : null,
      explanation: 'Ingredients could not be reliably compared because one or both lists are unavailable.',
    };
  }
  const matches = packagingValues.join('|') === referenceValues.join('|');
  const packagingSet = new Set(packagingValues);
  const referenceSet = new Set(referenceValues);
  const overlap = packagingValues.some((ingredient) => referenceSet.has(ingredient));
  const oneListContainsTheOther = packagingValues.every((ingredient) => referenceSet.has(ingredient))
    || referenceValues.every((ingredient) => packagingSet.has(ingredient));
  if (!matches && overlap && oneListContainsTheOther) {
    return {
      code: 'INGREDIENTS_UNKNOWN', field: 'ingredients', status: 'UNKNOWN', severity: 'INFO',
      packagingValue: packaging.join(', '), referenceValue: reference.join(', '),
      explanation: 'The ingredient lists overlap, but one list may be incomplete, so a mismatch was not concluded.',
    };
  }
  return {
    code: `INGREDIENTS_${matches ? 'MATCH' : 'MISMATCH'}`,
    field: 'ingredients', status: matches ? 'MATCH' : 'MISMATCH',
    severity: matches ? 'INFO' : 'HIGH',
    packagingValue: packaging.join(', '), referenceValue: reference.join(', '),
    explanation: matches
      ? 'The reliable ingredient lists match.'
      : 'The reliable ingredient lists differ.',
  };
}

export function compareProduct(
  extracted: ExtractedProduct,
  reference: MedicineReference,
): VerificationFinding[] {
  return [
    compareField('nafdacNumber', extracted.nafdacNumber, reference.nafdacNumber),
    compareField('productName', extracted.productName, reference.productName),
    compareField('manufacturer', extracted.manufacturer, reference.manufacturer),
    compareField('strength', extracted.strength, reference.strength),
    compareIngredients(extracted.ingredients, reference.ingredients),
  ];
}

export function buildFindings(
  extracted: ExtractedProduct,
  reference: MedicineReference,
): VerificationFinding[] {
  return compareProduct(extracted, reference);
}
