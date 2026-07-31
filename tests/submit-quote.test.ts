import { describe, expect, test } from 'vitest';
import { formatDescription } from '../functions/api/submit-quote';

// Minimal valid submission — spread over per-test to vary only what matters.
const base = {
  calculatedPrice: 140,
  basePrice: 140,
  firstCleanPrice: null,
  baseFirstCleanPrice: null,
  isOutlier: false,
  isOutOfArea: false,
  travelSurchargeApplied: false,
  travelSurcharge: 0,
  serviceType: 'residential-recurring',
  frequency: 'biweekly',
  zip: '22815',
  name: 'Jane Doe',
  phone: '(540) 555-0123',
  email: 'jane@example.com',
  propertyAddress: '123 Main St, Broadway, VA',
};

describe('Jobber note — travel surcharge itemisation', () => {
  test('Ring 2 breaks the price into cleaning + travel line items', () => {
    const note = formatDescription({
      ...base,
      calculatedPrice: 165,
      travelSurchargeApplied: true,
      travelSurcharge: 25,
      zip: '22980',
      propertyAddress: '257 Windigrove Dr, Waynesboro, VA',
    });
    expect(note).toContain('💰 Calculated Price: $165 / biweekly');
    expect(note).toContain('• Cleaning (form rate): $140');
    expect(note).toContain('• Travel surcharge (Ring 2, 22980): $25 per visit');
    expect(note).toContain('→ BILL AS A SEPARATE LINE ITEM on the Jobber quote.');
  });

  test('Ring 1 shows no surcharge lines at all', () => {
    const note = formatDescription(base);
    expect(note).toContain('💰 Calculated Price: $140 / biweekly');
    expect(note).not.toContain('Travel surcharge');
    expect(note).not.toContain('SEPARATE LINE ITEM');
  });

  test('first clean is itemised too when Ring 2 applies', () => {
    const note = formatDescription({
      ...base,
      calculatedPrice: 165,
      travelSurchargeApplied: true,
      travelSurcharge: 25,
      zip: '22980',
      firstCleanPrice: 235,
      baseFirstCleanPrice: 210,
    });
    expect(note).toContain('First clean (1.5×): $235');
    expect(note).toContain('• $210 cleaning + $25 travel');
  });
});

describe('Jobber note — address line', () => {
  test('free-typed address keeps the street and gains the ZIP', () => {
    const note = formatDescription({
      ...base,
      zip: '22980',
      propertyAddress: '257 Windigrove Dr, Waynesboro, VA',
    });
    expect(note).toContain('📍 257 Windigrove Dr, Waynesboro, VA, 22980');
  });

  test('autocompleted address uses the structured fields', () => {
    const note = formatDescription({
      ...base,
      zip: '22980',
      propertyStreet: '257 Windigrove Dr',
      propertyCity: 'Waynesboro',
      propertyState: 'VA',
    });
    expect(note).toContain('📍 257 Windigrove Dr, Waynesboro, VA 22980');
  });

  test('ZIP is not duplicated when the typed address already contains it', () => {
    const note = formatDescription({
      ...base,
      zip: '22980',
      propertyAddress: '257 Windigrove Dr, Waynesboro, VA 22980',
    });
    expect(note).toContain('📍 257 Windigrove Dr, Waynesboro, VA 22980');
    expect(note).not.toContain('22980, 22980');
  });
});
