import { describe, expect, test } from 'vitest';
import { calculate, roundToNearest } from '../src/lib/pricing';

describe('rounding helper', () => {
  test('rounds to nearest 0.25', () => {
    expect(roundToNearest(3.12, 0.25)).toBe(3.0);
    expect(roundToNearest(3.13, 0.25)).toBe(3.25);
    expect(roundToNearest(5.26, 0.25)).toBe(5.25);
  });

  test('rounds to nearest 5', () => {
    expect(roundToNearest(137, 5)).toBe(135);
    expect(roundToNearest(138, 5)).toBe(140);
    expect(roundToNearest(101.25, 5)).toBe(100);
  });
});

describe('residential recurring', () => {
  test('canonical example from pricing doc — 2,200 sqft / 3BA / 1 dog / biweekly', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 3,
      pets: '1-2',
      finishedBasement: false,
      extraLivingSpaces: 0,
      frequency: 'biweekly',
    });
    expect(r.price).toBe(140);
    expect(r.hours).toBe(3.5);
    expect(r.isOutlier).toBe(false);
  });

  test('small home weekly enforces $80 minimum', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: 'under-1000',
      bedrooms: 1,
      bathrooms: 1,
      pets: 'none',
      finishedBasement: false,
      extraLivingSpaces: 0,
      frequency: 'weekly',
    });
    expect(r.price).toBe(80);
  });

  test('biweekly 2500-3000 sqft with finished basement and pets', () => {
    // base 3.5 + basement 0.75 + pets 1-2 0.25 = 4.5 * 1.0 = 4.5 hrs * $40 = $180
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2500-3000',
      bedrooms: 4,
      bathrooms: 2,
      pets: '1-2',
      finishedBasement: true,
      extraLivingSpaces: 0,
      frequency: 'biweekly',
    });
    expect(r.price).toBe(180);
    expect(r.hours).toBe(4.5);
  });

  test('monthly multiplier 1,500-2,000 sqft', () => {
    // base 2.5 * 1.2 = 3.0 hrs * $40 = $120
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '1500-2000',
      bedrooms: 2,
      bathrooms: 2,
      pets: 'none',
      finishedBasement: false,
      extraLivingSpaces: 0,
      frequency: 'monthly',
    });
    expect(r.price).toBe(120);
    expect(r.hours).toBe(3.0);
  });

  test('3+ pets and extra bathrooms and living spaces', () => {
    // 3500-4000 base 4.5, expected 3 baths, 4 actual = +0.25, pets 3+ = +0.5,
    // 2 extra living = +0.5. total adj = 1.25. 4.5 + 1.25 = 5.75 * 1.0 biweekly = 5.75.
    // $230 * min 80 = $230
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '3500-4000',
      bedrooms: 4,
      bathrooms: 4,
      pets: '3+',
      finishedBasement: false,
      extraLivingSpaces: 2,
      frequency: 'biweekly',
    });
    expect(r.hours).toBe(5.75);
    expect(r.price).toBe(230);
  });

  test('expected bathrooms 2.5 at 3,000-3,500 sqft (sheet parity)', () => {
    // 3000-3500 base 4.0, expected 2.5 baths, 3 actual = +0.125, biweekly 1.0
    // (4.0 + 0.125) = 4.125 → round 0.25 = 4.25 (half-up), * $40 = $170
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '3000-3500',
      bedrooms: 3,
      bathrooms: 3,
      pets: 'none',
      frequency: 'biweekly',
    });
    expect(r.hours).toBe(4.25);
    expect(r.price).toBe(170);
  });

  test('first clean is 1.5x recurring price', () => {
    // Canonical 2,200/3BA/1 dog biweekly: recurring $140, first $210
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 3,
      pets: '1-2',
      frequency: 'biweekly',
    });
    expect(r.price).toBe(140);
    expect(r.firstCleanPrice).toBe(210);
  });

  test('first clean includes travel surcharge', () => {
    // Recurring $140 + $25 travel = $165. First clean pre-travel $210 + $25 = $235.
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 3,
      pets: '1-2',
      frequency: 'biweekly',
      zip: '22630', // Ring 2
    });
    expect(r.price).toBe(165);
    expect(r.firstCleanPrice).toBe(235);
  });

  test('firstCleanPrice null for deep-clean / move / str / commercial', () => {
    expect(calculate({
      serviceType: 'deep-clean',
      squareFootage: '2000-2500',
      bedrooms: 3, bathrooms: 3, pets: '1-2',
    }).firstCleanPrice).toBeNull();

    expect(calculate({
      serviceType: 'move-out',
      bedrooms: 3,
    }).firstCleanPrice).toBeNull();

    expect(calculate({
      serviceType: 'str-turnover',
      bedrooms: 2,
    }).firstCleanPrice).toBeNull();

    expect(calculate({
      serviceType: 'commercial',
      squareFootage: '2000-3000',
      facilityType: 'office',
      frequency: 'weekly',
    }).firstCleanPrice).toBeNull();
  });

  test('weekly discount applied', () => {
    // 2000-2500 base 3.0 * 0.85 weekly = 2.55, round 0.25 = 2.5, $100
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 2,
      pets: 'none',
      frequency: 'weekly',
    });
    expect(r.hours).toBe(2.5);
    expect(r.price).toBe(100);
  });
});

describe('deep clean', () => {
  test('canonical example from pricing doc — 2,200 sqft / 3BA / 1 dog', () => {
    // residential adj 3.5 * 1.5 = 5.25 hrs * $45 = $236.25 → $235
    const r = calculate({
      serviceType: 'deep-clean',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 3,
      pets: '1-2',
      finishedBasement: false,
      extraLivingSpaces: 0,
    });
    expect(r.price).toBe(235);
    expect(r.hours).toBe(5.25);
  });

  test('tiny home enforces $200 minimum', () => {
    // under-1000 base 1.5 * 1.5 = 2.25 hrs * $45 = $101.25, but min is $200
    const r = calculate({
      serviceType: 'deep-clean',
      squareFootage: 'under-1000',
      bedrooms: 1,
      bathrooms: 1,
      pets: 'none',
    });
    expect(r.price).toBe(200);
  });

  test('deep clean with basement and pets', () => {
    // 3000-3500 base 4.0, expected 3 baths, 2 actual = +0, pets 3+ = 0.5, basement = 0.75
    // adj = 5.25 * 1.5 = 7.875 → round 0.25 (half up) = 8.0. 8.0 * 45 = $360
    const r = calculate({
      serviceType: 'deep-clean',
      squareFootage: '3000-3500',
      bedrooms: 3,
      bathrooms: 2,
      pets: '3+',
      finishedBasement: true,
    });
    expect(r.hours).toBe(8.0);
    expect(r.price).toBe(360);
  });
});

describe('move-out / move-in', () => {
  test('2BR standard', () => {
    const r = calculate({
      serviceType: 'move-out',
      bedrooms: 2,
    });
    expect(r.price).toBe(325);
  });

  test('3BR with garage + inside+outside trash + 2 carpet rooms', () => {
    // 375 + 50 + 75 + 80 = $580
    const r = calculate({
      serviceType: 'move-out',
      bedrooms: 3,
      addons: { garage: true, insideOutsideTrash: true, carpetRooms: 2 },
    });
    expect(r.price).toBe(580);
  });

  test('4BR PM bulk rate', () => {
    const r = calculate({
      serviceType: 'move-in',
      bedrooms: 4,
      pmBulk: true,
    });
    expect(r.price).toBe(400);
  });

  test('5+ BR standard', () => {
    const r = calculate({
      serviceType: 'move-out',
      bedrooms: 6,
    });
    expect(r.price).toBe(500);
  });

  test('inside-only trash does not stack with inside+outside', () => {
    // only +$50 when insideOutsideTrash is false
    const r = calculate({
      serviceType: 'move-out',
      bedrooms: 2,
      addons: { trashInside: true },
    });
    expect(r.price).toBe(375);
  });
});

describe('STR turnovers', () => {
  test('2BR base', () => {
    const r = calculate({ serviceType: 'str-turnover', bedrooms: 2 });
    expect(r.price).toBe(160);
  });

  test('3BR with all add-ons', () => {
    // 200 + 50 + 25 + 35 + 30 = $340
    const r = calculate({
      serviceType: 'str-turnover',
      bedrooms: 3,
      addons: { laundry: true, trash: true, hotTub: true, outdoor: true },
    });
    expect(r.price).toBe(340);
  });

  test('4+ BR capped at 4BR price', () => {
    const r = calculate({ serviceType: 'str-turnover', bedrooms: 6 });
    expect(r.price).toBe(250);
  });
});

describe('commercial recurring', () => {
  test('3000-4000 sqft office weekly', () => {
    // base 3.75, 1 restroom = 0 adj, 1 breakroom = 0.25 adj, office 1.0, weekly 1.0
    // (3.75 + 0.25) * 1.0 * 1.0 = 4.0 hrs * $35 = $140
    const r = calculate({
      serviceType: 'commercial',
      squareFootage: '3000-4000',
      facilityType: 'office',
      restrooms: 1,
      breakrooms: 1,
      frequency: 'weekly',
    });
    expect(r.price).toBe(140);
    expect(r.hours).toBe(4.0);
  });

  test('medical facility monthly premium', () => {
    // 2000-3000 base 3.0, 2 restrooms = +0.25, 1 breakroom = +0.25, medical 1.3, monthly 1.2
    // (3.0 + 0.5) * 1.3 * 1.2 = 5.46 → round 0.25 = 5.5, 5.5*35 = $192.50 → round 5 (half up) = $195
    const r = calculate({
      serviceType: 'commercial',
      squareFootage: '2000-3000',
      facilityType: 'medical',
      restrooms: 2,
      breakrooms: 1,
      frequency: 'monthly',
    });
    expect(r.hours).toBe(5.5);
    expect(r.price).toBe(195);
  });

  test('restaurant 5x-week discount', () => {
    // 1500-2000 base 2.25, restaurant 1.25, 5x 0.80
    // 2.25 * 1.25 * 0.80 = 2.25 → round 0.25 = 2.25, 2.25 * 35 = $78.75 → $80
    const r = calculate({
      serviceType: 'commercial',
      squareFootage: '1500-2000',
      facilityType: 'restaurant',
      frequency: '5x-week',
    });
    expect(r.hours).toBe(2.25);
    expect(r.price).toBe(80);
  });

  test('small commercial enforces $70 minimum', () => {
    // under-1000 base 1.25, office 1.0, 5x 0.8 = 1.0 hrs * $35 = $35, min $70
    const r = calculate({
      serviceType: 'commercial',
      squareFootage: 'under-1000',
      facilityType: 'office',
      frequency: '5x-week',
    });
    expect(r.price).toBe(70);
  });
});

describe('outlier routing', () => {
  test('5+ bedrooms triggers outlier (no price)', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '3000-3500',
      bedrooms: 5,
      bathrooms: 3,
      pets: 'none',
      frequency: 'biweekly',
    });
    expect(r.isOutlier).toBe(true);
    expect(r.outlierReason).toBe('5+ bedrooms');
    expect(r.price).toBeNull();
  });

  test('5,000+ sqft triggers outlier', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '5000+',
      bedrooms: 4,
      bathrooms: 3,
      pets: 'none',
      frequency: 'biweekly',
    });
    expect(r.isOutlier).toBe(true);
    expect(r.outlierReason).toBe('Square footage 5,000+');
  });

  test('heavy clutter triggers outlier', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 2,
      pets: 'none',
      heavyClutter: true,
      frequency: 'biweekly',
    });
    expect(r.isOutlier).toBe(true);
    expect(r.outlierReason).toBe('Heavy clutter');
  });

  test('biohazard triggers outlier', () => {
    const r = calculate({
      serviceType: 'deep-clean',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 2,
      pets: 'none',
      biohazard: true,
    });
    expect(r.isOutlier).toBe(true);
    expect(r.outlierReason).toBe('Biohazard / mold / water damage');
  });

  test('commercial 10,000+ sqft triggers outlier', () => {
    const r = calculate({
      serviceType: 'commercial',
      squareFootage: '10000+',
      facilityType: 'office',
      frequency: 'weekly',
    });
    expect(r.isOutlier).toBe(true);
    expect(r.outlierReason).toBe('Square footage 10,000+');
  });
});

describe('ZIP / service area', () => {
  test('Ring 1 ZIP — no travel surcharge', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 3,
      pets: '1-2',
      frequency: 'biweekly',
      zip: '22815', // Broadway
    });
    expect(r.price).toBe(140);
    expect(r.travelSurchargeApplied).toBe(false);
    expect(r.travelSurcharge).toBe(0);
  });

  test('Ring 2 ZIP — +$25 travel surcharge', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 3,
      pets: '1-2',
      frequency: 'biweekly',
      zip: '22630', // Front Royal
    });
    expect(r.price).toBe(165);
    expect(r.travelSurchargeApplied).toBe(true);
    expect(r.travelSurcharge).toBe(25);
  });

  test('Out-of-area ZIP returns null price and isOutOfArea=true', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500',
      bedrooms: 3,
      bathrooms: 3,
      pets: '1-2',
      frequency: 'biweekly',
      zip: '23220', // Richmond
    });
    expect(r.price).toBeNull();
    expect(r.isOutOfArea).toBe(true);
  });

  test('New Market (22844) — Ring 1, no surcharge', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500', bedrooms: 3, bathrooms: 2, pets: 'none',
      frequency: 'biweekly', zip: '22844',
    });
    expect(r.isOutOfArea).toBe(false);
    expect(r.travelSurchargeApplied).toBe(false);
  });

  test('Mt. Jackson (22842) — Ring 1, no surcharge', () => {
    const r = calculate({
      serviceType: 'residential-recurring',
      squareFootage: '2000-2500', bedrooms: 3, bathrooms: 2, pets: 'none',
      frequency: 'biweekly', zip: '22842',
    });
    expect(r.isOutOfArea).toBe(false);
    expect(r.travelSurchargeApplied).toBe(false);
  });

  test('Winchester (22601) — Ring 2, +$25', () => {
    const r = calculate({
      serviceType: 'move-out', bedrooms: 3, zip: '22601',
    });
    expect(r.travelSurchargeApplied).toBe(true);
    expect(r.price).toBe(400);
  });

  test('Ring 2 surcharge applies to move-out flat pricing', () => {
    const r = calculate({
      serviceType: 'move-out',
      bedrooms: 3,
      zip: '24450', // Lexington
    });
    expect(r.price).toBe(400); // 375 + 25
  });
});
