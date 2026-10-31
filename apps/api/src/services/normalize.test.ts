import { isMedicineCategory, type ExtractedProduct, type MedicineReference } from '@counterfeitiq/shared';
import { describe, expect, it } from 'vitest';
import { compareProduct } from './compare';
import {
  normalizeIngredient,
  normalizeManufacturer,
  normalizeProductName,
  normalizeStrength,
  productNamesConflict,
} from './normalize';

const pack: ExtractedProduct = {
  category: 'medicine', productName: 'Examplol', brand: null, nafdacNumber: 'A1-123456',
  manufacturer: 'Example Pharma Ltd', strength: null, ingredients: [],
  batchNumber: null, manufacturingDate: null, expiryDate: null,
};

const record: MedicineReference = {
  productName: 'Examplol', nafdacNumber: 'A1-123456', manufacturer: 'Example Pharma Ltd',
  strength: null, ingredients: [], registrationExpiry: null, retrievedAt: '2026-10-31T00:00:00.000Z',
};

function nameStatus(onPack: string, onRecord: string) {
  const findings = compareProduct({ ...pack, productName: onPack }, { ...record, productName: onRecord });
  return findings.find((finding) => finding.field === 'productName')?.status;
}

describe('product names', () => {
  it.each([
    ['Examplol 500mg Tablets', 'Examplol'],
    ['Examplol 2.5 mg Tablets', 'Examplol'],
    ['Examplol 1,000 mg Tablets', 'Examplol'],
    ['Examplol 2.5 mg/5 ml Syrup', 'Examplol'],
    ['Co-Examplol', 'Coexamplol'],
    ['Examplol 1 g Tablets', 'Examplol 1000 mg'],
  ])('treats "%s" and "%s" as the same product', (onPack, onRecord) => {
    expect(nameStatus(onPack, onRecord)).toBe('MATCH');
  });

  it.each([
    ['Examplol 250mg Tablets', 'Examplol 500mg Tablets'],
    ['Examplol Tablets', 'Examplol Syrup'],
    ['Examplol Extra', 'Examplol'],
  ])('keeps the real difference between "%s" and "%s"', (onPack, onRecord) => {
    expect(nameStatus(onPack, onRecord)).toBe('MISMATCH');
  });

  it('does not treat a dosage stated on only one side as a conflict', () => {
    expect(productNamesConflict('Examplol 500mg', 'Examplol')).toBe(false);
    expect(normalizeProductName('500 mg tablets')).toBeNull();
  });
});

describe('manufacturers', () => {
  it.each([
    ['Example Pharma Ltd.', 'Example Pharmaceuticals Limited'],
    ['Example Pharma Nig. Ltd', 'Example Pharmaceuticals Nigeria Limited'],
  ])('treats "%s" and "%s" as the same company', (a, b) => {
    expect(normalizeManufacturer(a)).toBe(normalizeManufacturer(b));
  });

  it('keeps different companies different', () => {
    expect(normalizeManufacturer('Example Pharma')).not.toBe(normalizeManufacturer('Sample Pharma'));
  });
});

describe('strengths', () => {
  it.each([
    ['500 mcg', '0.5 mg'],
    ['0.07 g', '70 mg'],
    ['20 mcg/0.5 ml', '0.02 mg/0.5 ml'],
  ])('treats %s and %s as equal', (a, b) => {
    expect(normalizeStrength(a)).toBe(normalizeStrength(b));
  });

  it('keeps different doses different', () => {
    expect(normalizeStrength('500 mcg')).not.toBe(normalizeStrength('5 mg'));
  });
});

describe('ingredients and categories', () => {
  it('ignores hyphenation in ingredient names', () => {
    expect(normalizeIngredient('Co-trimoxazole')).toBe(normalizeIngredient('Cotrimoxazole'));
  });

  it.each(['vaccine', 'Herbal Medicine'])('treats %s as a medicine', (category) => {
    expect(isMedicineCategory(category)).toBe(true);
  });

  it.each(['cosmetic', 'food', 'other'])('does not treat %s as a medicine', (category) => {
    expect(isMedicineCategory(category)).toBe(false);
  });
});
