import { describe, expect, test } from 'vitest';
import { normalizePromoCode, validatePromoCode, PROMO_CODES } from '../src/lib/promo';

describe('normalizePromoCode', () => {
  test('uppercases and strips non-alphanumerics', () => {
    expect(normalizePromoCode('hello10')).toBe('HELLO10');
    expect(normalizePromoCode(' Hello-10 ')).toBe('HELLO10');
    expect(normalizePromoCode('neighbor 10')).toBe('NEIGHBOR10');
  });

  test('handles null/undefined/empty', () => {
    expect(normalizePromoCode(undefined)).toBe('');
    expect(normalizePromoCode(null)).toBe('');
    expect(normalizePromoCode('   ')).toBe('');
  });
});

describe('validatePromoCode — valid codes (case-insensitive)', () => {
  for (const code of Object.keys(PROMO_CODES)) {
    test(`${code} matches`, () => {
      const r = validatePromoCode(code);
      expect(r.valid).toBe(true);
      expect(r.isEmpty).toBe(false);
      expect(r.label).toBe('10% off your first recurring clean');
      expect(r.piece).toBe(PROMO_CODES[code].piece);
    });
    test(`${code} matches lowercase + whitespace`, () => {
      const r = validatePromoCode(`  ${code.toLowerCase()}  `);
      expect(r.valid).toBe(true);
      expect(r.normalized).toBe(code);
    });
  }
});

describe('validatePromoCode — empty', () => {
  test('empty input is not valid but flagged isEmpty (no-promo submission)', () => {
    for (const v of ['', '   ', undefined, null]) {
      const r = validatePromoCode(v);
      expect(r.isEmpty).toBe(true);
      expect(r.valid).toBe(false);
      expect(r.label).toBeNull();
    }
  });
});

describe('validatePromoCode — invalid', () => {
  test('unknown non-empty code is invalid but preserves raw entry', () => {
    const r = validatePromoCode('SAVEBIG');
    expect(r.isEmpty).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.label).toBeNull();
    expect(r.piece).toBeNull();
    expect(r.raw).toBe('SAVEBIG');
    expect(r.normalized).toBe('SAVEBIG');
  });

  test('raw is preserved verbatim (trimmed) for attribution even when invalid', () => {
    expect(validatePromoCode('  bogus code 99 ').raw).toBe('bogus code 99');
  });
});
