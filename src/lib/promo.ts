// Promo code validation for the /quote calculator.
//
// Each lead-acquisition Vistaprint piece (postcard, flyer, door hanger) carries
// a unique code so we can attribute which physical asset drove the lead. All
// three currently map to the same offer: 10% off the first recurring clean.
// The discount is NOT applied to the on-site estimate — it rides into the
// Jobber note + notification email so Wilkins applies it on the official quote.
//
// Add more codes here as we print more pieces. Single source of truth, imported
// by both the client UI (QuoteCalculator) and the server (submit-quote).

export interface PromoDefinition {
  /** Customer-facing offer description. */
  label: string;
  /** Which printed piece this code is on — for lead attribution. */
  piece: string;
}

export interface PromoResult {
  /** Exactly what the user entered, trimmed — preserved even if invalid. */
  raw: string;
  /** Uppercased form used for matching. */
  normalized: string;
  /** True when the user typed nothing. Empty is a valid (no-promo) submission. */
  isEmpty: boolean;
  /** True only when a non-empty code matches a known code. */
  valid: boolean;
  /** Offer label when valid, else null. */
  label: string | null;
  /** Attribution piece when valid, else null. */
  piece: string | null;
}

export const PROMO_CODES: Record<string, PromoDefinition> = {
  HELLO10: { label: '10% off your first recurring clean', piece: 'postcard' },
  FLYER10: { label: '10% off your first recurring clean', piece: 'flyer' },
  NEIGHBOR10: { label: '10% off your first recurring clean', piece: 'door-hanger' },
};

/** Strip to alphanumerics and uppercase — matches the input field's behavior. */
export function normalizePromoCode(input: string | undefined | null): string {
  return (input ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function validatePromoCode(input: string | undefined | null): PromoResult {
  const raw = (input ?? '').trim();
  const normalized = normalizePromoCode(input);
  const isEmpty = normalized.length === 0;
  const match = isEmpty ? undefined : PROMO_CODES[normalized];
  return {
    raw,
    normalized,
    isEmpty,
    valid: Boolean(match),
    label: match?.label ?? null,
    piece: match?.piece ?? null,
  };
}
