// Gal Gone Green pricing engine.
// Source of truth for the /quote calculator and the /api/submit-quote function.
// All prices are flat. Hourly rates are internal only — never shown to customers.

export type ServiceType =
  | 'residential-recurring'
  | 'deep-clean'
  | 'move-out'
  | 'move-in'
  | 'str-turnover'
  | 'commercial';

export type ResidentialFrequency = 'weekly' | 'biweekly' | 'monthly';

export type CommercialFrequency =
  | '5x-week'
  | '3x-week'
  | '2x-week'
  | 'weekly'
  | 'biweekly'
  | 'monthly';

export type PetTier = 'none' | '1-2' | '3+';

export type SquareFootageBucket =
  | 'under-1000'
  | '1000-1500'
  | '1500-2000'
  | '2000-2500'
  | '2500-3000'
  | '3000-3500'
  | '3500-4000'
  | '4000-5000'
  | '5000+';

export type CommercialSqftBucket =
  | 'under-1000'
  | '1000-1500'
  | '1500-2000'
  | '2000-3000'
  | '3000-4000'
  | '4000-5000'
  | '5000-7500'
  | '7500-10000'
  | '10000+';

export type FacilityType = 'office' | 'gas-station' | 'restaurant' | 'medical';

export type MoveBedroomTier = 1 | 2 | 3 | 4 | 5;

export interface ResidentialInputs {
  serviceType: 'residential-recurring' | 'deep-clean';
  squareFootage: SquareFootageBucket;
  bedrooms?: number;
  bathrooms: number;
  pets: PetTier;
  finishedBasement?: boolean;
  extraLivingSpaces?: number;
  frequency?: ResidentialFrequency;
  heavyClutter?: boolean;
  smokeOdor?: boolean;
  hoarding?: boolean;
  biohazard?: boolean;
  zip?: string;
}

export interface MoveAddons {
  garage?: boolean;
  trashInside?: boolean;
  insideOutsideTrash?: boolean;
  carpetRooms?: number;
  insideAppliances?: boolean;
}

export interface MoveInputs {
  serviceType: 'move-out' | 'move-in';
  bedrooms: number;
  pmBulk?: boolean;
  addons?: MoveAddons;
  zip?: string;
}

export interface StrAddons {
  laundry?: boolean;
  trash?: boolean;
  hotTub?: boolean;
  outdoor?: boolean;
}

export interface StrInputs {
  serviceType: 'str-turnover';
  bedrooms: number;
  addons?: StrAddons;
  zip?: string;
}

export interface CommercialInputs {
  serviceType: 'commercial';
  squareFootage: CommercialSqftBucket;
  facilityType: FacilityType;
  restrooms?: number;
  breakrooms?: number;
  frequency: CommercialFrequency;
  zip?: string;
}

export type QuoteInputs =
  | ResidentialInputs
  | MoveInputs
  | StrInputs
  | CommercialInputs;

export interface QuoteResult {
  price: number | null;
  hours: number | null;
  // First clean (1.5x) — only populated for residential-recurring. This is the
  // price a brand-new recurring customer pays for their first cleaning; all
  // subsequent cleanings are at the recurring `price` above.
  firstCleanPrice: number | null;
  isOutlier: boolean;
  outlierReason: string | null;
  isOutOfArea: boolean;
  travelSurchargeApplied: boolean;
  travelSurcharge: number;
  errors: string[];
}

// ----- Rate tables -----

const RESIDENTIAL_RATE = 40;
const RESIDENTIAL_MIN = 80;
const DEEP_CLEAN_RATE = 45;
const DEEP_CLEAN_MIN = 200;
const DEEP_CLEAN_MULTIPLIER = 1.5;
const COMMERCIAL_RATE = 35;
const COMMERCIAL_MIN = 70;
const TRAVEL_SURCHARGE = 25;

const RESIDENTIAL_BASE_HRS: Record<SquareFootageBucket, number> = {
  'under-1000': 1.5,
  '1000-1500': 2.0,
  '1500-2000': 2.5,
  '2000-2500': 3.0,
  '2500-3000': 3.5,
  '3000-3500': 4.0,
  '3500-4000': 4.5,
  '4000-5000': 5.0,
  '5000+': 5.5,
};

const RESIDENTIAL_FREQ_MULT: Record<ResidentialFrequency, number> = {
  weekly: 0.85,
  biweekly: 1.0,
  monthly: 1.2,
};

const COMMERCIAL_BASE_HRS: Record<CommercialSqftBucket, number> = {
  'under-1000': 1.25,
  '1000-1500': 1.75,
  '1500-2000': 2.25,
  '2000-3000': 3.0,
  '3000-4000': 3.75,
  '4000-5000': 4.5,
  '5000-7500': 5.5,
  '7500-10000': 7.0,
  '10000+': 0,
};

const FACILITY_MULT: Record<FacilityType, number> = {
  office: 1.0,
  'gas-station': 1.15,
  restaurant: 1.25,
  medical: 1.3,
};

const COMMERCIAL_FREQ_MULT: Record<CommercialFrequency, number> = {
  '5x-week': 0.8,
  '3x-week': 0.85,
  '2x-week': 0.9,
  weekly: 1.0,
  biweekly: 1.1,
  monthly: 1.2,
};

const MOVE_PRICES: Record<MoveBedroomTier, { standard: number; pmBulk: number }> = {
  1: { standard: 275, pmBulk: 250 },
  2: { standard: 325, pmBulk: 300 },
  3: { standard: 375, pmBulk: 350 },
  4: { standard: 425, pmBulk: 400 },
  5: { standard: 500, pmBulk: 475 },
};

const STR_PRICES: Record<1 | 2 | 3 | 4, number> = {
  1: 120,
  2: 160,
  3: 200,
  4: 250,
};

// Ring 1 — standard pricing, no surcharge. ~30 min or less from Broadway.
// Sourced from authoritative USPS ZIP-by-county data for Rockingham County
// (all ZIPs) + close-in Shenandoah, Page, and Augusta towns within 30 min.
export const RING_1_ZIPS = new Set<string>([
  // Rockingham County (entire county — home base)
  '22801', // Harrisonburg
  '22802', // Harrisonburg
  '22811', // Bergton
  '22812', // Bridgewater
  '22815', // Broadway
  '22820', // Criders
  '22821', // Dayton
  '22827', // Elkton
  '22830', // Fulks Run
  '22831', // Hinton
  '22832', // Keezletown
  '22833', // Lacey Spring
  '22834', // Linville
  '22840', // McGaheysville / Massanutten
  '22841', // Mt. Crawford
  '22846', // Penn Laird
  '22848', // Pleasant Valley
  '22850', // Singers Glen
  '22853', // Timberville
  '24441', // Grottoes
  '24471', // Port Republic
  '24486', // Weyers Cave
  // Shenandoah County — close-in south end
  '22824', // Edinburg
  '22842', // Mt. Jackson
  '22844', // New Market
  '22847', // Quicksburg
  // Page County — close-in
  '22849', // Shenandoah
  '22851', // Stanley
  // Augusta County — close-in north end
  '22843', // Mt. Solon
  '24431', // Crimora
  '24437', // Fort Defiance
  '24467', // Mount Sidney
  '24469', // New Hope
  '24482', // Verona
]);

// Ring 2 — standard pricing + $25 travel surcharge. 30–80 min from Broadway.
// Covers the rest of the Shenandoah Valley corridor: Augusta (Staunton/
// Waynesboro area), Rockbridge (Lexington), upper Shenandoah (Woodstock/
// Strasburg), Page (Luray), Warren (Front Royal), Clarke (Berryville),
// Frederick (Winchester).
export const RING_2_ZIPS = new Set<string>([
  // Shenandoah County (upper / further)
  '22626', // Fishers Hill
  '22641', // Strasburg
  '22644', // Maurertown
  '22652', // Fort Valley
  '22657', // Strasburg
  '22660', // Toms Brook
  '22664', // Woodstock
  '22810', // Basye
  '22845', // Orkney Springs
  // Page County (further)
  '22610', // Bentonville
  '22650', // Rileyville
  '22835', // Luray
  // Warren County (Front Royal area)
  '22630', // Front Royal
  '22642', // Linden
  '22645', // Middletown
  '22649', // Middletown
  '22655', // Stephens City
  '22663', // White Post
  // Clarke County
  '20130', // Paris
  '20135', // Bluemont
  '22611', // Berryville
  '22620', // Boyce
  '22646', // Millwood
  // Frederick County (Winchester area)
  '22601', // Winchester
  '22602', // Winchester
  '22603', // Winchester
  '22622', // Brucetown
  '22624', // Clear Brook
  '22625', // Cross Junction
  '22637', // Gore
  '22654', // Star Tannery
  '22656', // Stephenson
  // Augusta County (Staunton/Waynesboro area + rural)
  '22920', // Afton
  '22939', // Fishersville
  '22952', // Lyndhurst
  '22967', // Roseland
  '22980', // Waynesboro
  '24401', // Staunton
  '24402', // Staunton (PO)
  '24411', // Augusta Springs
  '24421', // Churchville
  '24430', // Craigsville
  '24432', // Deerfield
  '24440', // Greenville
  '24459', // Middlebrook
  '24463', // Mint Spring
  '24472', // Raphine
  '24476', // Steeles Tavern
  '24477', // Stuarts Draft
  '24479', // Swoope
  '24483', // Vesuvius
  '24485', // West Augusta
  // Rockbridge County (Lexington / Buena Vista)
  '24415', // Brownsburg
  '24416', // Buena Vista
  '24435', // Fairfield
  '24439', // Goshen
  '24450', // Lexington
  '24473', // Rockbridge Baths
  '24555', // Glasgow
  '24578', // Natural Bridge
  '24579', // Natural Bridge Station
]);

// ----- Helpers -----

export function roundToNearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

// For residential. Expected bathrooms by sqft bucket.
// Matches the internal Autumn/Wilkins Google Sheet formula:
//   <1,500 → 1  ·  <2,500 → 2  ·  <3,500 → 2.5  ·  else → 3
function expectedBathrooms(sqft: SquareFootageBucket): number {
  switch (sqft) {
    case 'under-1000':
    case '1000-1500':
      return 1;
    case '1500-2000':
    case '2000-2500':
      return 2;
    case '2500-3000':
    case '3000-3500':
      return 2.5;
    case '3500-4000':
    case '4000-5000':
    case '5000+':
      return 3;
  }
}

function checkZip(zip: string | undefined): {
  isOutOfArea: boolean;
  travelSurchargeApplied: boolean;
} {
  if (!zip) return { isOutOfArea: false, travelSurchargeApplied: false };
  const z = zip.trim();
  if (RING_1_ZIPS.has(z)) return { isOutOfArea: false, travelSurchargeApplied: false };
  if (RING_2_ZIPS.has(z)) return { isOutOfArea: false, travelSurchargeApplied: true };
  return { isOutOfArea: true, travelSurchargeApplied: false };
}

function residentialOutlierReason(inp: ResidentialInputs): string | null {
  if ((inp.bedrooms ?? 0) >= 5) return '5+ bedrooms';
  if (inp.squareFootage === '5000+') return 'Square footage 5,000+';
  if (inp.heavyClutter) return 'Heavy clutter';
  if (inp.smokeOdor) return 'Smoke or odor issues';
  if (inp.hoarding) return 'Hoarding situation';
  if (inp.biohazard) return 'Biohazard / mold / water damage';
  return null;
}

function commercialOutlierReason(inp: CommercialInputs): string | null {
  if (inp.squareFootage === '10000+') return 'Square footage 10,000+';
  return null;
}

function clampMoveBedroom(n: number): MoveBedroomTier {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 5;
}

function clampStrBedroom(n: number): 1 | 2 | 3 | 4 {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 4;
}

function outOfAreaResult(): QuoteResult {
  return {
    price: null,
    hours: null,
    firstCleanPrice: null,
    isOutlier: false,
    outlierReason: null,
    isOutOfArea: true,
    travelSurchargeApplied: false,
    travelSurcharge: 0,
    errors: [],
  };
}

function outlierResult(
  reason: string,
  travelSurcharge: number,
  travelSurchargeApplied: boolean,
): QuoteResult {
  return {
    price: null,
    hours: null,
    firstCleanPrice: null,
    isOutlier: true,
    outlierReason: reason,
    isOutOfArea: false,
    travelSurchargeApplied,
    travelSurcharge,
    errors: [],
  };
}

// ----- Per-service calculators -----

function calcResidentialRecurring(
  inp: ResidentialInputs,
  travelSurcharge: number,
  travelSurchargeApplied: boolean,
): QuoteResult {
  const outlier = residentialOutlierReason(inp);
  if (outlier) return outlierResult(outlier, travelSurcharge, travelSurchargeApplied);

  const freq = inp.frequency;
  if (!freq) {
    return {
      price: null,
      hours: null,
      firstCleanPrice: null,
      isOutlier: false,
      outlierReason: null,
      isOutOfArea: false,
      travelSurchargeApplied,
      travelSurcharge,
      errors: ['frequency required for residential-recurring'],
    };
  }

  const base = RESIDENTIAL_BASE_HRS[inp.squareFootage];
  const extraBaths = Math.max(0, inp.bathrooms - expectedBathrooms(inp.squareFootage));
  const bathAdj = extraBaths * 0.25;
  const petAdj = inp.pets === '1-2' ? 0.25 : inp.pets === '3+' ? 0.5 : 0;
  const basementAdj = inp.finishedBasement ? 0.75 : 0;
  const livingAdj = (inp.extraLivingSpaces ?? 0) * 0.25;

  const adjustedHrs = base + bathAdj + petAdj + basementAdj + livingAdj;
  const freqMult = RESIDENTIAL_FREQ_MULT[freq];
  const hours = roundToNearest(adjustedHrs * freqMult, 0.25);

  let recurringPrePrice = roundToNearest(hours * RESIDENTIAL_RATE, 5);
  recurringPrePrice = Math.max(recurringPrePrice, RESIDENTIAL_MIN);

  // First clean is 1.5x the recurring price (sheet: ROUND(B32*1.5/5,0)*5).
  // Min floor is not re-applied — sheet doesn't, so neither do we.
  const firstCleanPreTravel = roundToNearest(recurringPrePrice * 1.5, 5);

  const price = recurringPrePrice + travelSurcharge;
  const firstCleanPrice = firstCleanPreTravel + travelSurcharge;

  return {
    price,
    hours,
    firstCleanPrice,
    isOutlier: false,
    outlierReason: null,
    isOutOfArea: false,
    travelSurchargeApplied,
    travelSurcharge,
    errors: [],
  };
}

function calcDeepClean(
  inp: ResidentialInputs,
  travelSurcharge: number,
  travelSurchargeApplied: boolean,
): QuoteResult {
  const outlier = residentialOutlierReason(inp);
  if (outlier) return outlierResult(outlier, travelSurcharge, travelSurchargeApplied);

  const base = RESIDENTIAL_BASE_HRS[inp.squareFootage];
  const extraBaths = Math.max(0, inp.bathrooms - expectedBathrooms(inp.squareFootage));
  const bathAdj = extraBaths * 0.25;
  const petAdj = inp.pets === '1-2' ? 0.25 : inp.pets === '3+' ? 0.5 : 0;
  const basementAdj = inp.finishedBasement ? 0.75 : 0;
  const livingAdj = (inp.extraLivingSpaces ?? 0) * 0.25;

  const adjustedHrs = base + bathAdj + petAdj + basementAdj + livingAdj;
  const hours = roundToNearest(adjustedHrs * DEEP_CLEAN_MULTIPLIER, 0.25);

  let price = roundToNearest(hours * DEEP_CLEAN_RATE, 5);
  price = Math.max(price, DEEP_CLEAN_MIN);
  price += travelSurcharge;

  return {
    price,
    hours,
    firstCleanPrice: null,
    isOutlier: false,
    outlierReason: null,
    isOutOfArea: false,
    travelSurchargeApplied,
    travelSurcharge,
    errors: [],
  };
}

function calcMove(
  inp: MoveInputs,
  travelSurcharge: number,
  travelSurchargeApplied: boolean,
): QuoteResult {
  const tier = clampMoveBedroom(inp.bedrooms);
  const table = MOVE_PRICES[tier];
  const base = inp.pmBulk ? table.pmBulk : table.standard;

  const a = inp.addons ?? {};
  let addons = 0;
  if (a.garage) addons += 50;
  if (a.insideOutsideTrash) {
    addons += 75;
  } else if (a.trashInside) {
    addons += 50;
  }
  if (a.carpetRooms && a.carpetRooms > 0) addons += a.carpetRooms * 40;
  if (a.insideAppliances) addons += 50;

  const price = base + addons + travelSurcharge;

  return {
    price,
    hours: null,
    firstCleanPrice: null,
    isOutlier: false,
    outlierReason: null,
    isOutOfArea: false,
    travelSurchargeApplied,
    travelSurcharge,
    errors: [],
  };
}

function calcStr(
  inp: StrInputs,
  travelSurcharge: number,
  travelSurchargeApplied: boolean,
): QuoteResult {
  const tier = clampStrBedroom(inp.bedrooms);
  const base = STR_PRICES[tier];

  const a = inp.addons ?? {};
  let addons = 0;
  if (a.laundry) addons += 50;
  if (a.trash) addons += 25;
  if (a.hotTub) addons += 35;
  if (a.outdoor) addons += 30;

  const price = base + addons + travelSurcharge;

  return {
    price,
    hours: null,
    firstCleanPrice: null,
    isOutlier: false,
    outlierReason: null,
    isOutOfArea: false,
    travelSurchargeApplied,
    travelSurcharge,
    errors: [],
  };
}

function calcCommercial(
  inp: CommercialInputs,
  travelSurcharge: number,
  travelSurchargeApplied: boolean,
): QuoteResult {
  const outlier = commercialOutlierReason(inp);
  if (outlier) return outlierResult(outlier, travelSurcharge, travelSurchargeApplied);

  const base = COMMERCIAL_BASE_HRS[inp.squareFootage];
  const restroomAdj = Math.max(0, (inp.restrooms ?? 1) - 1) * 0.25;
  const breakroomAdj = (inp.breakrooms ?? 0) * 0.25;
  const facMult = FACILITY_MULT[inp.facilityType];
  const freqMult = COMMERCIAL_FREQ_MULT[inp.frequency];

  const hours = roundToNearest((base + restroomAdj + breakroomAdj) * facMult * freqMult, 0.25);

  let price = roundToNearest(hours * COMMERCIAL_RATE, 5);
  price = Math.max(price, COMMERCIAL_MIN);
  price += travelSurcharge;

  return {
    price,
    hours,
    firstCleanPrice: null,
    isOutlier: false,
    outlierReason: null,
    isOutOfArea: false,
    travelSurchargeApplied,
    travelSurcharge,
    errors: [],
  };
}

// ----- Public entry point -----

export function calculate(inputs: QuoteInputs): QuoteResult {
  const zipInfo = checkZip((inputs as { zip?: string }).zip);

  if (zipInfo.isOutOfArea) return outOfAreaResult();

  const travelSurcharge = zipInfo.travelSurchargeApplied ? TRAVEL_SURCHARGE : 0;
  const travelSurchargeApplied = zipInfo.travelSurchargeApplied;

  switch (inputs.serviceType) {
    case 'residential-recurring':
      return calcResidentialRecurring(inputs, travelSurcharge, travelSurchargeApplied);
    case 'deep-clean':
      return calcDeepClean(inputs, travelSurcharge, travelSurchargeApplied);
    case 'move-out':
    case 'move-in':
      return calcMove(inputs, travelSurcharge, travelSurchargeApplied);
    case 'str-turnover':
      return calcStr(inputs, travelSurcharge, travelSurchargeApplied);
    case 'commercial':
      return calcCommercial(inputs, travelSurcharge, travelSurchargeApplied);
  }
}
