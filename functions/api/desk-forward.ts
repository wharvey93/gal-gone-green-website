// Quote-form fast path to the desk (GGG booking agent Stage 0, 12 Nov 2026).
//
// After a quote passes validation and has gone to Jobber and email, the Worker posts a trimmed copy to Ops HQ
// (/api/hooks/quote-form) with a shared secret, so Mara has the lead in seconds and the CEO gets a phone alert.
// It never blocks or breaks the customer's submit: it runs after the response (waitUntil), times out after
// 5 seconds, and any failure is logged without the customer's details. With OPS_HQ_QUOTE_URL or
// GGG_QUOTE_FORWARD_SECRET unset it does nothing at all.
//
// The price the browser sent is re-checked here by running the same quote engine (src/lib/pricing.ts) on the
// submitted inputs, so the desk knows whether the number it would quote is the form's real number.
import { calculate, isCompleteZip, type QuoteInputs } from '../../src/lib/pricing';

export interface ForwardEnv {
  OPS_HQ_QUOTE_URL?: string;
  GGG_QUOTE_FORWARD_SECRET?: string;
}

// The fields of the submission this file reads (a subset of submit-quote's QuoteSubmission).
export interface ForwardSubmission {
  calculatedPrice: number | null;
  basePrice?: number | null;
  firstCleanPrice?: number | null;
  isOutlier: boolean;
  outlierReason?: string;
  isOutOfArea: boolean;
  travelSurchargeApplied: boolean;
  travelSurcharge?: number;
  serviceType: string;
  frequency?: string;
  squareFootage?: string;
  bedrooms?: number;
  bathrooms?: number;
  pets?: string;
  finishedBasement?: boolean;
  extraLivingSpaces?: number;
  moveBedrooms?: number;
  pmBulk?: boolean;
  moveAddons?: Record<string, boolean | number>;
  strBedrooms?: number;
  strAddons?: Record<string, boolean>;
  commercialSqft?: string;
  facilityType?: string;
  restrooms?: number;
  breakrooms?: number;
  heavyClutter?: boolean;
  smokeOdor?: boolean;
  hoarding?: boolean;
  biohazard?: boolean;
  zip?: string;
  preferredStartDate?: string;
  name: string;
  phone: string;
  email: string;
  propertyAddress: string;
  propertyStreet?: string;
  propertyCity?: string;
  propertyState?: string;
  details?: string;
  promoCode?: string;
}

/** The same mapping QuoteCalculator's toInputs() makes from its form state. */
export function toQuoteInputs(s: ForwardSubmission): QuoteInputs | null {
  const zip = isCompleteZip(s.zip) ? s.zip!.trim() : undefined;
  const flags = { heavyClutter: s.heavyClutter, smokeOdor: s.smokeOdor, hoarding: s.hoarding, biohazard: s.biohazard };
  switch (s.serviceType) {
    case 'residential-recurring':
    case 'deep-clean':
      return {
        serviceType: s.serviceType,
        squareFootage: s.squareFootage as never,
        bedrooms: s.bedrooms,
        bathrooms: s.bathrooms as number,
        pets: s.pets as never,
        finishedBasement: s.finishedBasement,
        extraLivingSpaces: s.extraLivingSpaces,
        ...(s.serviceType === 'residential-recurring' ? { frequency: s.frequency as never } : {}),
        ...flags,
        zip,
      } as QuoteInputs;
    case 'move-out':
    case 'move-in':
      return {
        serviceType: s.serviceType,
        bedrooms: s.moveBedrooms as number,
        pmBulk: s.pmBulk,
        addons: {
          garage: s.moveAddons?.garage as boolean | undefined,
          trashInside: s.moveAddons?.trashInside as boolean | undefined,
          insideOutsideTrash: s.moveAddons?.insideOutsideTrash as boolean | undefined,
          carpetRooms: s.moveAddons?.carpetRooms as number | undefined,
          insideAppliances: s.moveAddons?.insideAppliances as boolean | undefined,
        },
        zip,
      };
    case 'str-turnover':
      return { serviceType: 'str-turnover', bedrooms: s.strBedrooms as number, addons: s.strAddons ?? {}, zip };
    case 'commercial':
      return {
        serviceType: 'commercial',
        squareFootage: s.commercialSqft as never,
        facilityType: s.facilityType as never,
        restrooms: s.restrooms,
        breakrooms: s.breakrooms,
        frequency: s.frequency as never,
        zip,
      };
    default:
      return null;
  }
}

export type PriceCheck = { priceCheck: 'match' | 'mismatch' | 'not-checked'; serverPrice: number | null; serverFirstCleanPrice: number | null };

/** The look-first reason from the engine itself (never the browser's text), or null. */
export function serverOutlierReason(s: ForwardSubmission): string | null {
  const inputs = toQuoteInputs(s);
  if (!inputs) return null;
  try {
    return calculate(inputs).outlierReason ?? null;
  } catch {
    return null;
  }
}

/** Re-runs the quote engine on the submitted inputs and compares it with what the browser showed. */
export function checkPrice(s: ForwardSubmission): PriceCheck {
  const inputs = toQuoteInputs(s);
  if (!inputs) return { priceCheck: 'not-checked', serverPrice: null, serverFirstCleanPrice: null };
  let r;
  try {
    r = calculate(inputs);
  } catch {
    return { priceCheck: 'not-checked', serverPrice: null, serverFirstCleanPrice: null };
  }
  const same = (a: number | null | undefined, b: number | null | undefined) => (a ?? null) === (b ?? null);
  const ok = same(r.price, s.calculatedPrice) && same(r.firstCleanPrice, s.firstCleanPrice) && r.isOutlier === !!s.isOutlier;
  return { priceCheck: ok ? 'match' : 'mismatch', serverPrice: r.price, serverFirstCleanPrice: r.firstCleanPrice };
}

const cap = (v: string | undefined, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The body Ops HQ's /api/hooks/quote-form accepts (its schema refuses any other field). */
export function buildDeskPayload(s: ForwardSubmission, ctx: { submissionId: string; leadSource: string; jobberClientCreated: boolean; now?: Date }) {
  const check = checkPrice(s);
  const street = cap(s.propertyStreet, 200);
  const city = cap(s.propertyCity, 100);
  const state = cap(s.propertyState, 40);
  const zip = (s.zip ?? '').trim();
  return {
    submissionId: ctx.submissionId,
    submittedAt: (ctx.now ?? new Date()).toISOString(),
    name: s.name.trim().slice(0, 120),
    phone: s.phone.trim().slice(0, 40),
    email: s.email.trim().slice(0, 200),
    street: street ?? null,
    city: city ?? null,
    state: state ?? null,
    zip,
    address: (street ? [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : s.propertyAddress.trim()).slice(0, 300),
    serviceType: s.serviceType,
    frequency: cap(s.frequency, 40) ?? null,
    price: num(s.calculatedPrice),
    basePrice: num(s.basePrice),
    firstCleanPrice: num(s.firstCleanPrice),
    travelSurchargeApplied: !!s.travelSurchargeApplied,
    travelSurcharge: num(s.travelSurcharge),
    isOutlier: !!s.isOutlier,
    outlierReason: s.isOutlier ? serverOutlierReason(s) : null,
    isOutOfArea: !!s.isOutOfArea,
    preferredStartDate: cap(s.preferredStartDate, 40) ?? null,
    leadSource: ctx.leadSource.slice(0, 80),
    promoCode: cap(s.promoCode, 40) ?? null,
    details: cap(s.details, 2000) ?? null,
    ...check,
    jobberClientCreated: ctx.jobberClientCreated,
  };
}

/** Posts the quote to Ops HQ. Returns what happened; never throws. */
export async function forwardToDesk(
  env: ForwardEnv,
  payload: ReturnType<typeof buildDeskPayload>,
  fetchImpl: typeof fetch = fetch,
): Promise<'skipped' | 'sent' | 'failed'> {
  const url = env.OPS_HQ_QUOTE_URL;
  const secret = env.GGG_QUOTE_FORWARD_SECRET;
  if (!url || !secret || !url.startsWith('https://')) return 'skipped';
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ggg-quote-secret': secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'sent';
    console.error('[desk-forward] Ops HQ answered', res.status); // status only: no customer details in logs
    return 'failed';
  } catch (e) {
    console.error('[desk-forward] failed', e instanceof Error ? e.name : 'Error');
    return 'failed';
  }
}
