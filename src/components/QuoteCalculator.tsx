/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  calculate,
  type CommercialFrequency,
  type CommercialSqftBucket,
  type FacilityType,
  type PetTier,
  type QuoteInputs,
  type ResidentialFrequency,
  type ServiceType,
  type SquareFootageBucket,
} from '../lib/pricing';
import { validatePromoCode } from '../lib/promo';

type UIState = {
  serviceType: ServiceType;
  // residential / deep clean
  squareFootage: SquareFootageBucket;
  bedrooms: number;
  bathrooms: number;
  pets: PetTier;
  finishedBasement: boolean;
  extraLivingSpaces: number;
  frequency: ResidentialFrequency;
  heavyClutter: boolean;
  smokeOdor: boolean;
  hoarding: boolean;
  biohazard: boolean;
  // move / str
  moveBedrooms: number;
  pmBulk: boolean;
  moveGarage: boolean;
  moveTrashInside: boolean;
  moveTrashInsideOutside: boolean;
  moveCarpetRooms: number;
  moveInsideAppliances: boolean;
  strBedrooms: number;
  strLaundry: boolean;
  strTrash: boolean;
  strHotTub: boolean;
  strOutdoor: boolean;
  // commercial
  commercialSqft: CommercialSqftBucket;
  facilityType: FacilityType;
  restrooms: number;
  breakrooms: number;
  commercialFrequency: CommercialFrequency;
  // location
  zip: string;
  // free-form notes
  details: string;
  // contact
  name: string;
  phone: string;
  email: string;
  propertyAddress: string;
  // Structured pieces — populated when user picks an autocomplete suggestion.
  // Empty when user types freely without selecting. Fall back to propertyAddress
  // as street on submit if propertyStreet is empty.
  propertyStreet: string;
  propertyCity: string;
  propertyState: string;
  preferredStartDate: string;
  // promo
  promoCode: string;
};

const initial: UIState = {
  serviceType: 'residential-recurring',
  squareFootage: '2000-2500',
  bedrooms: 3,
  bathrooms: 2,
  pets: 'none',
  finishedBasement: false,
  extraLivingSpaces: 0,
  frequency: 'biweekly',
  heavyClutter: false,
  smokeOdor: false,
  hoarding: false,
  biohazard: false,
  moveBedrooms: 3,
  pmBulk: false,
  moveGarage: false,
  moveTrashInside: false,
  moveTrashInsideOutside: false,
  moveCarpetRooms: 0,
  moveInsideAppliances: false,
  strBedrooms: 2,
  strLaundry: false,
  strTrash: false,
  strHotTub: false,
  strOutdoor: false,
  commercialSqft: '2000-3000',
  facilityType: 'office',
  restrooms: 1,
  breakrooms: 1,
  commercialFrequency: 'weekly',
  zip: '',
  details: '',
  name: '',
  phone: '',
  email: '',
  propertyAddress: '',
  propertyStreet: '',
  propertyCity: '',
  propertyState: '',
  preferredStartDate: '',
  promoCode: '',
};

function toInputs(s: UIState): QuoteInputs {
  const zip = s.zip.trim() || undefined;
  switch (s.serviceType) {
    case 'residential-recurring':
      return {
        serviceType: 'residential-recurring',
        squareFootage: s.squareFootage,
        bedrooms: s.bedrooms,
        bathrooms: s.bathrooms,
        pets: s.pets,
        finishedBasement: s.finishedBasement,
        extraLivingSpaces: s.extraLivingSpaces,
        frequency: s.frequency,
        heavyClutter: s.heavyClutter,
        smokeOdor: s.smokeOdor,
        hoarding: s.hoarding,
        biohazard: s.biohazard,
        zip,
      };
    case 'deep-clean':
      return {
        serviceType: 'deep-clean',
        squareFootage: s.squareFootage,
        bedrooms: s.bedrooms,
        bathrooms: s.bathrooms,
        pets: s.pets,
        finishedBasement: s.finishedBasement,
        extraLivingSpaces: s.extraLivingSpaces,
        heavyClutter: s.heavyClutter,
        smokeOdor: s.smokeOdor,
        hoarding: s.hoarding,
        biohazard: s.biohazard,
        zip,
      };
    case 'move-out':
    case 'move-in':
      return {
        serviceType: s.serviceType,
        bedrooms: s.moveBedrooms,
        pmBulk: s.pmBulk,
        addons: {
          garage: s.moveGarage,
          trashInside: s.moveTrashInside,
          insideOutsideTrash: s.moveTrashInsideOutside,
          carpetRooms: s.moveCarpetRooms,
          insideAppliances: s.moveInsideAppliances,
        },
        zip,
      };
    case 'str-turnover':
      return {
        serviceType: 'str-turnover',
        bedrooms: s.strBedrooms,
        addons: {
          laundry: s.strLaundry,
          trash: s.strTrash,
          hotTub: s.strHotTub,
          outdoor: s.strOutdoor,
        },
        zip,
      };
    case 'commercial':
      return {
        serviceType: 'commercial',
        squareFootage: s.commercialSqft,
        facilityType: s.facilityType,
        restrooms: s.restrooms,
        breakrooms: s.breakrooms,
        frequency: s.commercialFrequency,
        zip,
      };
  }
}

const sqftLabel: Record<SquareFootageBucket, string> = {
  'under-1000': 'Under 1,000 sq ft',
  '1000-1500': '1,000 – 1,500',
  '1500-2000': '1,500 – 2,000',
  '2000-2500': '2,000 – 2,500',
  '2500-3000': '2,500 – 3,000',
  '3000-3500': '3,000 – 3,500',
  '3500-4000': '3,500 – 4,000',
  '4000-5000': '4,000 – 5,000',
  '5000+': '5,000+',
};

const commercialSqftLabel: Record<CommercialSqftBucket, string> = {
  'under-1000': 'Under 1,000 sq ft',
  '1000-1500': '1,000 – 1,500',
  '1500-2000': '1,500 – 2,000',
  '2000-3000': '2,000 – 3,000',
  '3000-4000': '3,000 – 4,000',
  '4000-5000': '4,000 – 5,000',
  '5000-7500': '5,000 – 7,500',
  '7500-10000': '7,500 – 10,000',
  '10000+': '10,000+',
};

const serviceLabel: Record<ServiceType, string> = {
  'residential-recurring': 'Recurring home cleaning',
  'deep-clean': 'One-time deep clean',
  'move-out': 'Move-out cleaning',
  'move-in': 'Move-in cleaning',
  'str-turnover': 'Vacation rental turnover',
  commercial: 'Commercial / office',
};

const SAGE = '#4a8c4a';
const SAGE_DARK = '#3a7a3a';
const CREAM = '#faf8f4';
const TERRACOTTA = '#c47f34';
const CHARCOAL = '#2c2c2c';

// Places Autocomplete via the Places API (New) REST endpoint. We keep our own
// styled input + render our own dropdown — cleaner than Google's web component
// and lets us control UX fully. The API key is passed through from Astro's
// build-time env var (PUBLIC_GOOGLE_MAPS_API_KEY) and is safe to expose since
// the key is HTTP-referrer-restricted to galgonegreen.com.
interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

function usePlacesAutocomplete(
  apiKey: string | undefined,
  query: string,
  enabled: boolean,
): PlaceSuggestion[] {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  useEffect(() => {
    if (!apiKey || !enabled || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
          },
          body: JSON.stringify({
            input: query,
            includedRegionCodes: ['us'],
            includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
            locationBias: {
              rectangle: {
                low: { latitude: 37.7, longitude: -79.5 },
                high: { latitude: 39.2, longitude: -78.0 },
              },
            },
          }),
        });
        if (!res.ok) throw new Error(`Places ${res.status}`);
        const data = (await res.json()) as {
          suggestions?: Array<{
            placePrediction?: {
              placeId: string;
              structuredFormat?: {
                mainText?: { text: string };
                secondaryText?: { text: string };
              };
              text?: { text: string };
            };
          }>;
        };
        const parsed = (data.suggestions ?? [])
          .filter((s) => s.placePrediction)
          .map((s) => ({
            placeId: s.placePrediction!.placeId,
            mainText:
              s.placePrediction!.structuredFormat?.mainText?.text ??
              s.placePrediction!.text?.text ??
              '',
            secondaryText: s.placePrediction!.structuredFormat?.secondaryText?.text ?? '',
          }));
        setSuggestions(parsed);
      } catch (err) {
        if ((err as { name?: string } | null)?.name !== 'AbortError') {
          console.warn('Places autocomplete failed:', err);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [apiKey, query, enabled]);

  return suggestions;
}

interface PlaceDetails {
  formattedAddress: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

async function fetchPlaceDetails(apiKey: string, placeId: string): Promise<PlaceDetails> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'formattedAddress,addressComponents',
      },
    },
  );
  if (!res.ok) throw new Error(`Place details ${res.status}`);
  const data = (await res.json()) as {
    formattedAddress?: string;
    addressComponents?: Array<{ types?: string[]; shortText?: string; longText?: string }>;
  };
  const comps = data.addressComponents ?? [];
  const byType = (t: string) => comps.find((c) => c.types?.includes(t));
  const streetNumber = byType('street_number')?.shortText;
  const route = byType('route')?.shortText ?? byType('route')?.longText;
  const city =
    byType('locality')?.longText ??
    byType('sublocality')?.longText ??
    byType('postal_town')?.longText;
  const state = byType('administrative_area_level_1')?.shortText;
  const zip = byType('postal_code')?.shortText ?? byType('postal_code')?.longText;
  const street = [streetNumber, route].filter(Boolean).join(' ') || undefined;
  return {
    formattedAddress: data.formattedAddress ?? '',
    street,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,
  };
}

// Formats a US phone number as the user types. Strips non-digits, drops a
// leading "1" country code if present, caps at 10 digits, and renders as
// (XXX) XXX-XXXX. Partial input keeps the already-typed portion.
function formatUSPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// True when the phone field has all 10 digits entered.
function phoneIsComplete(formatted: string): boolean {
  return formatted.replace(/\D/g, '').length === 10;
}

type SubmitMode = 'preview' | 'call-to-book' | 'live';

interface Props {
  submitMode?: SubmitMode;
  phone?: string;
  googleMapsApiKey?: string;
}

export default function QuoteCalculator({
  submitMode = 'preview',
  phone = '(571) 209-7745',
  googleMapsApiKey,
}: Props) {
  const [s, setS] = useState<UIState>(initial);
  const update = (patch: Partial<UIState>) => setS((p) => ({ ...p, ...patch }));
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string>('');
  // Promo code: validated live, but the "not recognized" message only shows
  // after the field is blurred so we don't nag while the user is still typing.
  const [promoBlurred, setPromoBlurred] = useState(false);

  // Deep-link support: ?promo=HELLO10 pre-fills the field (e.g. if a future QR
  // points straight at /quote?promo=…). Manual entry from the printed card
  // still works exactly the same.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrl = new URLSearchParams(window.location.search).get('promo');
    if (fromUrl) {
      update({ promoCode: fromUrl.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Places autocomplete: we show a dropdown when the user is typing into the
  // address field. Picking a suggestion fetches place details and fills both
  // the address and ZIP.
  const [addressFocused, setAddressFocused] = useState(false);
  const placesActive = Boolean(googleMapsApiKey) && addressFocused;
  const placeSuggestions = usePlacesAutocomplete(googleMapsApiKey, s.propertyAddress, placesActive);

  async function handlePickSuggestion(sug: PlaceSuggestion) {
    if (!googleMapsApiKey) return;
    try {
      const details = await fetchPlaceDetails(googleMapsApiKey, sug.placeId);
      setS((p) => ({
        ...p,
        propertyAddress: details.formattedAddress || p.propertyAddress,
        propertyStreet: details.street ?? p.propertyStreet,
        propertyCity: details.city ?? p.propertyCity,
        propertyState: details.state ?? p.propertyState,
        zip: details.zip ?? p.zip,
      }));
    } catch (err) {
      console.warn('Place details failed; falling back to suggestion text', err);
      setS((p) => ({
        ...p,
        propertyAddress: `${sug.mainText}${sug.secondaryText ? ', ' + sug.secondaryText : ''}`,
      }));
    }
    setAddressFocused(false);
  }

  // When user types in the address field directly, clear any stale structured
  // fields so we don't send a mismatch on submit (e.g. they edit the street
  // after picking a suggestion).
  function handleAddressInput(value: string) {
    setS((p) => ({
      ...p,
      propertyAddress: value,
      propertyStreet: '',
      propertyCity: '',
      propertyState: '',
      zip: '',
    }));
  }

  const result = useMemo(() => calculate(toInputs(s)), [s]);
  const promo = useMemo(() => validatePromoCode(s.promoCode), [s.promoCode]);

  const isResidential = s.serviceType === 'residential-recurring' || s.serviceType === 'deep-clean';
  const isMove = s.serviceType === 'move-out' || s.serviceType === 'move-in';

  const contactComplete =
    s.name.trim() && phoneIsComplete(s.phone) && /.+@.+\..+/.test(s.email) && s.propertyAddress.trim();

  async function handleSubmit() {
    if (submitState === 'loading') return;
    setSubmitState('loading');
    setSubmitError('');

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const payload = {
      // calculated
      calculatedPrice: result.price,
      firstCleanPrice: result.firstCleanPrice,
      isOutlier: result.isOutlier,
      outlierReason: result.outlierReason,
      isOutOfArea: result.isOutOfArea,
      travelSurchargeApplied: result.travelSurchargeApplied,
      // service
      serviceType: s.serviceType,
      frequency: s.serviceType === 'residential-recurring' ? s.frequency : undefined,
      // residential / deep
      squareFootage: isResidential ? s.squareFootage : undefined,
      bedrooms: isResidential ? s.bedrooms : undefined,
      bathrooms: isResidential ? s.bathrooms : undefined,
      pets: isResidential ? s.pets : undefined,
      finishedBasement: isResidential ? s.finishedBasement : undefined,
      extraLivingSpaces: isResidential ? s.extraLivingSpaces : undefined,
      // move
      moveBedrooms: isMove ? s.moveBedrooms : undefined,
      pmBulk: isMove ? s.pmBulk : undefined,
      moveAddons: isMove
        ? {
            garage: s.moveGarage,
            trashInside: s.moveTrashInside,
            insideOutsideTrash: s.moveTrashInsideOutside,
            carpetRooms: s.moveCarpetRooms,
            insideAppliances: s.moveInsideAppliances,
          }
        : undefined,
      // str
      strBedrooms: s.serviceType === 'str-turnover' ? s.strBedrooms : undefined,
      strAddons:
        s.serviceType === 'str-turnover'
          ? { laundry: s.strLaundry, trash: s.strTrash, hotTub: s.strHotTub, outdoor: s.strOutdoor }
          : undefined,
      // commercial
      commercialSqft: s.serviceType === 'commercial' ? s.commercialSqft : undefined,
      facilityType: s.serviceType === 'commercial' ? s.facilityType : undefined,
      restrooms: s.serviceType === 'commercial' ? s.restrooms : undefined,
      breakrooms: s.serviceType === 'commercial' ? s.breakrooms : undefined,
      // flags
      heavyClutter: s.heavyClutter,
      smokeOdor: s.smokeOdor,
      hoarding: s.hoarding,
      biohazard: s.biohazard,
      // location
      zip: s.zip,
      preferredStartDate: s.preferredStartDate || undefined,
      // contact
      name: s.name.trim(),
      phone: s.phone.trim(),
      email: s.email.trim(),
      propertyAddress: s.propertyAddress.trim(),
      // Structured address fields (empty strings when user didn't pick a
      // suggestion — Worker falls back to propertyAddress as street).
      propertyStreet: s.propertyStreet.trim() || undefined,
      propertyCity: s.propertyCity.trim() || undefined,
      propertyState: s.propertyState.trim() || undefined,
      details: s.details.trim() || undefined,
      // promo — raw entry preserved even if unrecognized, for attribution
      promoCode: promo.raw || undefined,
      // attribution
      utmSource: urlParams?.get('utm_source') ?? undefined,
      utmMedium: urlParams?.get('utm_medium') ?? undefined,
      utmCampaign: urlParams?.get('utm_campaign') ?? undefined,
      utmContent: urlParams?.get('utm_content') ?? undefined,
      utmTerm: urlParams?.get('utm_term') ?? undefined,
      gclid: urlParams?.get('gclid') ?? undefined,
      referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    };

    try {
      const res = await fetch('/api/submit-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: string[]; error?: string };
      if (!res.ok || !data.ok) {
        setSubmitState('error');
        setSubmitError(data.errors?.join(', ') ?? data.error ?? `Submit failed (${res.status})`);
        return;
      }
      setSubmitState('success');
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'conversion', {
          send_to: 'AW-16751447114/puUCCPCpirMcEMqY27M-',
          value: 150.0,
          currency: 'USD'
        });
      }
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams();
        params.set('svc', s.serviceType);
        if (result.isOutlier) params.set('type', 'assessment');
        else if (result.price !== null) params.set('price', String(result.price));
        window.location.href = `/thank-you-quote/?${params.toString()}`;
      }
    } catch (err) {
      setSubmitState('error');
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    }
  }

  if (submitState === 'success') {
    const isOutlier = result.isOutlier;
    return (
      <div class="rounded-lg border border-[#e3ddd0] bg-white p-6 md:p-8 shadow-sm max-w-2xl mx-auto" style={`color:${CHARCOAL}`}>
        <h2 class="font-['DM_Serif_Display'] text-2xl text-[#2c2c2c] mb-3">
          {isOutlier ? "We've got your details" : 'Your quote is on its way'}
        </h2>
        <p class="text-[#555] mb-2">
          {isOutlier
            ? "Because of the details you flagged, we'd like to do a quick 15-minute on-site look. Wilkins will call you within 2 business hours to schedule — usually free."
            : `Thanks, ${s.name.split(' ')[0]}. Wilkins will review your submission and send your official quote within 2 business hours (during Mon–Fri, 8am–5pm ET). It comes from Jobber — check your inbox and spam folder.`}
        </p>
        <p class="text-sm text-[#777] mt-4">
          Need us sooner? Call <a class="underline" href={`tel:${phone.replace(/[^0-9+]/g, '')}`}>{phone}</a>.
        </p>
      </div>
    );
  }

  const sectionClass =
    'rounded-lg border border-[#e3ddd0] bg-white p-5 md:p-6 shadow-sm';
  const labelClass = 'block text-sm font-semibold mb-1 text-[#2c2c2c]';
  const inputClass =
    'w-full rounded-md border border-[#d9d3c5] bg-white px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#4a8c4a]';

  return (
    <div class="space-y-5 pb-32" style={`color:${CHARCOAL}`}>
      {/* Service type */}
      <section class={sectionClass}>
        <h2 class="text-lg font-semibold mb-3">What kind of cleaning do you need?</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(serviceLabel) as ServiceType[]).map((st) => (
            <label
              class={`flex items-center gap-2 p-3 rounded-md border cursor-pointer transition ${
                s.serviceType === st
                  ? 'border-[#4a8c4a] bg-[#f3faf3]'
                  : 'border-[#e3ddd0] hover:border-[#b5cdb5]'
              }`}
            >
              <input
                type="radio"
                name="serviceType"
                checked={s.serviceType === st}
                onChange={() => update({ serviceType: st })}
                class="accent-[#4a8c4a]"
              />
              <span class="text-[15px]">{serviceLabel[st]}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Residential + deep clean inputs */}
      {isResidential && (
        <section class={sectionClass}>
          <h2 class="text-lg font-semibold mb-4">Your home</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class={labelClass}>Square footage</label>
              <select
                class={inputClass}
                value={s.squareFootage}
                onChange={(e) =>
                  update({ squareFootage: (e.currentTarget as HTMLSelectElement).value as SquareFootageBucket })
                }
              >
                {(Object.keys(sqftLabel) as SquareFootageBucket[]).map((k) => (
                  <option value={k}>{sqftLabel[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label class={labelClass}>Bedrooms</label>
              <select
                class={inputClass}
                value={String(s.bedrooms)}
                onChange={(e) => update({ bedrooms: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option value={String(n)}>{n === 5 ? '5' : n === 6 ? '6+' : String(n)}</option>
                ))}
              </select>
            </div>
            <div>
              <label class={labelClass}>Bathrooms</label>
              <select
                class={inputClass}
                value={String(s.bathrooms)}
                onChange={(e) => update({ bathrooms: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option value={String(n)}>{n === 5 ? '5+' : String(n)}</option>
                ))}
              </select>
            </div>
            <div>
              <label class={labelClass}>Pets</label>
              <select
                class={inputClass}
                value={s.pets}
                onChange={(e) => update({ pets: (e.currentTarget as HTMLSelectElement).value as PetTier })}
              >
                <option value="none">None</option>
                <option value="1-2">1–2 pets</option>
                <option value="3+">3+ pets</option>
              </select>
            </div>
            <div>
              <label class={labelClass}>Extra living spaces</label>
              <select
                class={inputClass}
                value={String(s.extraLivingSpaces)}
                onChange={(e) => update({ extraLivingSpaces: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option value={String(n)}>{n}</option>
                ))}
              </select>
              <p class="text-xs text-[#777] mt-1">Sunrooms, lofts, bonus rooms beyond standard bedrooms/living room.</p>
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={s.finishedBasement}
                  onChange={(e) => update({ finishedBasement: (e.currentTarget as HTMLInputElement).checked })}
                  class="w-4 h-4 accent-[#4a8c4a]"
                />
                Finished basement
              </label>
            </div>
          </div>
        </section>
      )}

      {/* Frequency — recurring only */}
      {s.serviceType === 'residential-recurring' && (
        <section class={sectionClass}>
          <h2 class="text-lg font-semibold mb-3">How often?</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['weekly', 'biweekly', 'monthly'] as ResidentialFrequency[]).map((f) => (
              <label
                class={`text-center p-3 rounded-md border cursor-pointer transition ${
                  s.frequency === f ? 'border-[#4a8c4a] bg-[#f3faf3]' : 'border-[#e3ddd0] hover:border-[#b5cdb5]'
                }`}
              >
                <input
                  type="radio"
                  name="freq"
                  checked={s.frequency === f}
                  onChange={() => update({ frequency: f })}
                  class="sr-only"
                />
                <div class="font-semibold capitalize">{f}</div>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Move-out / move-in */}
      {isMove && (
        <section class={sectionClass}>
          <h2 class="text-lg font-semibold mb-4">Move details</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class={labelClass}>Bedrooms</label>
              <select
                class={inputClass}
                value={String(s.moveBedrooms)}
                onChange={(e) => update({ moveBedrooms: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option value={String(n)}>{n >= 5 ? '5+' : String(n)}</option>
                ))}
              </select>
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={s.pmBulk}
                  onChange={(e) => update({ pmBulk: (e.currentTarget as HTMLInputElement).checked })}
                  class="w-4 h-4 accent-[#4a8c4a]"
                />
                Property manager (5+ units/mo — bulk pricing)
              </label>
            </div>
          </div>

          <h3 class="font-semibold mt-5 mb-2">Add-ons</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px]">
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.moveGarage} onChange={(e) => update({ moveGarage: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Garage cleaning (+$50)
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.moveInsideAppliances} onChange={(e) => update({ moveInsideAppliances: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Inside oven + fridge (+$50)
            </label>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.moveTrashInside}
                onChange={(e) => update({ moveTrashInside: (e.currentTarget as HTMLInputElement).checked, moveTrashInsideOutside: false })}
                class="w-4 h-4 accent-[#4a8c4a]"
              />
              Trash removal — inside only (+$50)
            </label>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.moveTrashInsideOutside}
                onChange={(e) => update({ moveTrashInsideOutside: (e.currentTarget as HTMLInputElement).checked, moveTrashInside: false })}
                class="w-4 h-4 accent-[#4a8c4a]"
              />
              Trash — inside + outside (+$75)
            </label>
            <div class="flex items-center gap-2">
              <label class="text-[15px] whitespace-nowrap">Carpet spot-treatment rooms:</label>
              <select
                class="rounded-md border border-[#d9d3c5] bg-white px-2 py-1"
                value={String(s.moveCarpetRooms)}
                onChange={(e) => update({ moveCarpetRooms: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option value={String(n)}>{n}</option>
                ))}
              </select>
              <span class="text-xs text-[#777]">(+$40 each)</span>
            </div>
          </div>
        </section>
      )}

      {/* STR */}
      {s.serviceType === 'str-turnover' && (
        <section class={sectionClass}>
          <h2 class="text-lg font-semibold mb-4">Rental details</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class={labelClass}>Bedrooms</label>
              <select
                class={inputClass}
                value={String(s.strBedrooms)}
                onChange={(e) => update({ strBedrooms: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option value={String(n)}>{n >= 4 ? '4+' : String(n)}</option>
                ))}
              </select>
            </div>
          </div>
          <h3 class="font-semibold mt-5 mb-2">Add-ons per turnover</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px]">
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.strLaundry} onChange={(e) => update({ strLaundry: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Laundry — linens + towels (+$50)
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.strTrash} onChange={(e) => update({ strTrash: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Trash removal (+$25)
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.strHotTub} onChange={(e) => update({ strHotTub: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Hot tub clean (+$35)
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.strOutdoor} onChange={(e) => update({ strOutdoor: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Patio / grill (+$30)
            </label>
          </div>
        </section>
      )}

      {/* Commercial */}
      {s.serviceType === 'commercial' && (
        <section class={sectionClass}>
          <h2 class="text-lg font-semibold mb-4">Commercial details</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class={labelClass}>Square footage</label>
              <select
                class={inputClass}
                value={s.commercialSqft}
                onChange={(e) => update({ commercialSqft: (e.currentTarget as HTMLSelectElement).value as CommercialSqftBucket })}
              >
                {(Object.keys(commercialSqftLabel) as CommercialSqftBucket[]).map((k) => (
                  <option value={k}>{commercialSqftLabel[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label class={labelClass}>Facility type</label>
              <select
                class={inputClass}
                value={s.facilityType}
                onChange={(e) => update({ facilityType: (e.currentTarget as HTMLSelectElement).value as FacilityType })}
              >
                <option value="office">Office / retail / church</option>
                <option value="gas-station">Gas station / convenience</option>
                <option value="restaurant">Restaurant / food service</option>
                <option value="medical">Medical / dental</option>
              </select>
            </div>
            <div>
              <label class={labelClass}>Restrooms</label>
              <select
                class={inputClass}
                value={String(s.restrooms)}
                onChange={(e) => update({ restrooms: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label class={labelClass}>Breakrooms / kitchens</label>
              <select
                class={inputClass}
                value={String(s.breakrooms)}
                onChange={(e) => update({ breakrooms: parseInt((e.currentTarget as HTMLSelectElement).value, 10) })}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class={labelClass}>Cleaning frequency</label>
              <select
                class={inputClass}
                value={s.commercialFrequency}
                onChange={(e) => update({ commercialFrequency: (e.currentTarget as HTMLSelectElement).value as CommercialFrequency })}
              >
                <option value="5x-week">5× per week</option>
                <option value="3x-week">3× per week</option>
                <option value="2x-week">2× per week</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {/* Special situations — residential / deep clean */}
      {isResidential && (
        <section class={sectionClass}>
          <h2 class="text-lg font-semibold mb-3">Any of these apply?</h2>
          <p class="text-sm text-[#777] mb-3">These need a quick on-site look, so we'll give you a personal assessment instead of an online price.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px]">
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.heavyClutter} onChange={(e) => update({ heavyClutter: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Heavy clutter
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.smokeOdor} onChange={(e) => update({ smokeOdor: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Smoke or strong odor
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.hoarding} onChange={(e) => update({ hoarding: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Hoarding situation
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={s.biohazard} onChange={(e) => update({ biohazard: (e.currentTarget as HTMLInputElement).checked })} class="w-4 h-4 accent-[#4a8c4a]" />
              Biohazard / mold / water damage
            </label>
          </div>
        </section>
      )}

      {/* Contact */}
      <section class={sectionClass}>
        <h2 class="text-lg font-semibold mb-4">Your info</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class={labelClass}>Full name<span class="text-[#c47f34]"> *</span></label>
            <input
              type="text"
              class={inputClass}
              value={s.name}
              placeholder="Jane Doe"
              onInput={(e) => update({ name: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>
          <div>
            <label class={labelClass}>Phone<span class="text-[#c47f34]"> *</span></label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={14}
              class={inputClass}
              value={s.phone}
              placeholder="(540) 555-0123"
              onInput={(e) => update({ phone: formatUSPhone((e.currentTarget as HTMLInputElement).value) })}
            />
          </div>
          <div class="sm:col-span-2">
            <label class={labelClass}>Email<span class="text-[#c47f34]"> *</span></label>
            <input
              type="email"
              class={inputClass}
              value={s.email}
              placeholder="jane@example.com"
              onInput={(e) => update({ email: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>
          <div class="sm:col-span-2">
            <label class={labelClass}>Property address<span class="text-[#c47f34]"> *</span></label>
            <div class="relative">
              <input
                type="text"
                class={inputClass}
                value={s.propertyAddress}
                placeholder={googleMapsApiKey ? 'Start typing your street address…' : '123 Main St, Broadway, VA'}
                autoComplete="off"
                onFocus={() => setAddressFocused(true)}
                onBlur={() => window.setTimeout(() => setAddressFocused(false), 180)}
                onInput={(e) => handleAddressInput((e.currentTarget as HTMLInputElement).value)}
              />
              {placesActive && placeSuggestions.length > 0 && (
                <ul class="absolute top-full left-0 right-0 mt-1 rounded-md border border-[#d9d3c5] bg-white shadow-lg z-20 max-h-64 overflow-y-auto">
                  {placeSuggestions.map((sug) => (
                    <li
                      key={sug.placeId}
                      class="px-3 py-2 cursor-pointer hover:bg-[#f3faf3] border-b border-[#eee] last:border-b-0"
                      onMouseDown={(e) => { e.preventDefault(); handlePickSuggestion(sug); }}
                    >
                      <div class="text-[15px] text-[#2c2c2c]">{sug.mainText}</div>
                      {sug.secondaryText && (
                        <div class="text-xs text-[#777]">{sug.secondaryText}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p class="text-xs text-[#777] mt-1">
              {!s.zip && googleMapsApiKey && 'Pick your address from the dropdown to confirm your area.'}
              {!s.zip && !googleMapsApiKey && 'We serve the Shenandoah Valley from Winchester to Lexington.'}
              {s.zip && result.travelSurchargeApplied && '+$25 travel surcharge (outer Valley).'}
              {s.zip && !result.travelSurchargeApplied && !result.isOutOfArea && '✓ In our core service area.'}
              {result.isOutOfArea && "Outside our service area — we'll still review your submission."}
            </p>
          </div>
          <div>
            <label class={labelClass}>Preferred start date</label>
            <input
              type="date"
              class={inputClass}
              value={s.preferredStartDate}
              onInput={(e) => update({ preferredStartDate: (e.currentTarget as HTMLInputElement).value })}
            />
            <p class="text-xs text-[#777] mt-1">We'll confirm the exact slot by phone.</p>
          </div>
        </div>
      </section>

      {/* Details — free-form notes */}
      <section class={sectionClass}>
        <h2 class="text-lg font-semibold mb-3">Anything we should know?</h2>
        <p class="text-sm text-[#777] mb-3">Gate code, parking notes, pet quirks, areas to skip, specific products you use — anything that helps us do a better job.</p>
        <textarea
          rows={4}
          class={`${inputClass} resize-y`}
          placeholder="Optional — the more specific, the better."
          value={s.details}
          onInput={(e) => update({ details: (e.currentTarget as HTMLTextAreaElement).value })}
        />
      </section>

      {/* Promo code — optional, sits just above the submit */}
      <section class={sectionClass}>
        <h2 class="text-lg font-semibold mb-1">
          Have a promo code?
          <span class="ml-2 text-xs font-normal text-[#777] uppercase tracking-wide">Optional</span>
        </h2>
        <p class="text-sm text-[#777] mb-3">From one of our cards or flyers — enter it to apply your discount.</p>
        <input
          type="text"
          class={`${inputClass} max-w-xs uppercase tracking-wide`}
          value={s.promoCode}
          placeholder="Enter your code"
          autoComplete="off"
          spellcheck={false}
          maxLength={20}
          aria-label="Promo code"
          onInput={(e) =>
            update({
              promoCode: (e.currentTarget as HTMLInputElement).value
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase(),
            })
          }
          onBlur={() => setPromoBlurred(true)}
        />
        {promo.valid && (
          <p class="text-sm mt-2 font-medium" style={`color:${SAGE}`}>
            ✓ {promo.label} — applied to your quote.
          </p>
        )}
        {promoBlurred && !promo.isEmpty && !promo.valid && (
          <p class="text-sm mt-2 text-red-600">Code not recognized. We can still send you a quote.</p>
        )}
      </section>

      {/* Price honor disclaimer */}
      <section class="rounded-lg bg-[#f3f0e8] border border-[#e3ddd0] p-4 md:p-5 text-sm text-[#555] leading-relaxed">
        <strong class="text-[#2c2c2c]">How our instant quote works:</strong>{' '}
        We honor this price as long as your home or business matches what you
        described. If something is materially different on arrival —
        significantly larger, heavy soiling, undisclosed pets, or conditions
        outside what you flagged — we'll walk through the adjustment with you
        before we start. You can always say no.
      </section>

      {/* Sticky price footer */}
      <div
        class="fixed bottom-0 left-0 right-0 border-t shadow-lg p-4 md:p-5 z-40"
        style={`background:${CREAM};border-color:#e3ddd0`}
      >
        <div class="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <PriceDisplay result={result} serviceType={s.serviceType} frequency={s.frequency} />
          {submitMode === 'preview' && (
            <button
              type="button"
              disabled
              class="px-5 py-3 rounded-md font-semibold text-white opacity-60 cursor-not-allowed"
              style={`background:${SAGE}`}
              title="Preview — submit disabled"
            >
              Book this price
            </button>
          )}
          {submitMode === 'call-to-book' && (
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
              class="px-5 py-3 rounded-md font-semibold text-white text-center whitespace-nowrap hover:brightness-110 transition"
              style={`background:${SAGE}`}
            >
              Call to book<br class="sm:hidden" />
              <span class="block text-xs font-normal opacity-90">{phone}</span>
            </a>
          )}
          {submitMode === 'live' && (
            <div class="flex flex-col items-end gap-1">
              <button
                type="button"
                disabled={!contactComplete || submitState === 'loading'}
                onClick={handleSubmit}
                class="px-5 py-3 rounded-md font-semibold text-white hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
                style={`background:${SAGE}`}
              >
                {submitState === 'loading' ? 'Submitting…' : result.isOutlier ? 'Request assessment' : 'Book this price'}
              </button>
              {submitState !== 'loading' && !contactComplete && (
                <span class="text-xs text-[#777]">Fill name, phone, email, address</span>
              )}
              {submitState === 'error' && (
                <span class="text-xs text-red-700 max-w-[200px] text-right">
                  {submitError || 'Something went wrong — please call us.'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceDisplay(props: {
  result: ReturnType<typeof calculate>;
  serviceType: ServiceType;
  frequency: ResidentialFrequency;
}) {
  const { result, serviceType, frequency } = props;

  if (result.isOutOfArea) {
    return (
      <div class="flex-1">
        <div class="font-semibold text-[#2c2c2c]">Outside our service area</div>
        <div class="text-xs text-[#777]">Drop your info — we'll reach out if we expand.</div>
      </div>
    );
  }

  if (result.isOutlier) {
    return (
      <div class="flex-1">
        <div class="font-semibold text-[#2c2c2c]">On-site assessment needed</div>
        <div class="text-xs text-[#777]">{result.outlierReason} — typically 15 minutes, usually free.</div>
      </div>
    );
  }

  const isRecurring = serviceType === 'residential-recurring';
  const isCommercial = serviceType === 'commercial';
  const perLabel = isRecurring
    ? `${frequency} · per clean`
    : isCommercial
      ? 'per clean'
      : serviceType === 'str-turnover'
        ? 'per turnover'
        : 'flat';

  return (
    <div class="flex-1">
      <div class="text-xs uppercase tracking-wide text-[#777]">Your estimated price</div>
      <div class="text-3xl font-bold" style="color:#2c2c2c">
        ${result.price}
        <span class="text-sm font-normal text-[#777] ml-2">{perLabel}</span>
      </div>
      {isRecurring && result.firstCleanPrice && (
        <div class="text-xs text-[#555] mt-0.5">
          First clean: <strong class="text-[#2c2c2c]">${result.firstCleanPrice}</strong>
          <span class="text-[#777]"> (1.5× to bring the home to baseline), then ${result.price} {frequency}</span>
        </div>
      )}
      {result.travelSurchargeApplied && (
        <div class="text-xs text-[#777]">Includes $25 travel surcharge (Ring 2).</div>
      )}
    </div>
  );
}
