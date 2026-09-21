// Lead attribution capture — shared by the site (every page, via BaseLayout)
// and the /quote form (at submit) and the Worker (lead-source classification).
//
// Why this exists (Sep 2026): the Google Ads → Jobber reconcile undercounted
// paid leads three months running because gclid was only read from the URL of
// the /quote page at submit time. Anyone who landed on an ad, browsed, and came
// back lost it. Now the first touch is persisted in localStorage (90 days) on
// ANY page, and the Worker stamps Jobber's built-in lead-source field from it.
//
// Pure functions take plain values so they are unit-testable without a DOM.

export const ATTRIBUTION_STORAGE_KEY = 'ggg_attribution';
export const ATTRIBUTION_TTL_DAYS = 90;
export const SITE_HOST = 'galgonegreen.com';

export interface Attribution {
  gclid?: string;
  gbraid?: string; // Google Ads iOS click id (App-to-web)
  wbraid?: string; // Google Ads iOS click id (web-to-app / privacy)
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  /** First EXTERNAL referrer for this touch (never galgonegreen.com itself). */
  referrer?: string;
  /** Path + query of the page that opened this touch. */
  landingPage?: string;
  /** ISO timestamp of the touch that set this record. */
  capturedAt?: string;
}

const UTM_PARAMS: Record<string, keyof Attribution> = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
};
const CLICK_ID_PARAMS: (keyof Attribution)[] = ['gclid', 'gbraid', 'wbraid'];
const MAX_LEN = 400;

const clip = (v: string | null | undefined): string | undefined => {
  const t = (v ?? '').trim();
  return t ? t.slice(0, MAX_LEN) : undefined;
};

export function isInternalHost(host: string, siteHost = SITE_HOST): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === siteHost || h.endsWith('.' + siteHost);
}

/** Returns the referrer only when it points outside the site; undefined otherwise. */
export function externalReferrer(referrer: string | null | undefined, siteHost = SITE_HOST): string | undefined {
  const r = clip(referrer);
  if (!r) return undefined;
  try {
    const host = new URL(r).hostname;
    return isInternalHost(host, siteHost) ? undefined : r;
  } catch {
    return undefined;
  }
}

export interface VisitInput {
  search: string;
  referrer: string;
  pathname: string;
  now?: Date;
  siteHost?: string;
}

/** Attribution facts observable on a single page view. */
export function parseVisit({ search, referrer, pathname, now = new Date(), siteHost = SITE_HOST }: VisitInput): Attribution {
  const params = new URLSearchParams(search);
  const a: Attribution = {};
  for (const key of CLICK_ID_PARAMS) {
    const v = clip(params.get(key));
    if (v) a[key] = v;
  }
  for (const [param, key] of Object.entries(UTM_PARAMS)) {
    const v = clip(params.get(param));
    if (v) a[key] = v;
  }
  const ref = externalReferrer(referrer, siteHost);
  if (ref) a.referrer = ref;
  a.landingPage = clip(`${pathname}${search}`) ?? '/';
  a.capturedAt = now.toISOString();
  return a;
}

export function hasCampaignSignal(a: Attribution | null | undefined): boolean {
  if (!a) return false;
  return !!(a.gclid || a.gbraid || a.wbraid || a.utmSource || a.utmMedium || a.utmCampaign);
}

export function isExpired(a: Attribution | null | undefined, now = new Date(), ttlDays = ATTRIBUTION_TTL_DAYS): boolean {
  if (!a?.capturedAt) return true;
  const t = Date.parse(a.capturedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > ttlDays * 24 * 60 * 60 * 1000;
}

const sameCampaign = (x: Attribution, y: Attribution): boolean =>
  x.gclid === y.gclid && x.gbraid === y.gbraid && x.wbraid === y.wbraid &&
  x.utmSource === y.utmSource && x.utmMedium === y.utmMedium && x.utmCampaign === y.utmCampaign &&
  x.utmContent === y.utmContent && x.utmTerm === y.utmTerm;

/**
 * Merge rule (last paid/campaign click wins; otherwise first touch sticks):
 *  - no stored record, or stored expired            -> this visit
 *  - this visit carries a click id / UTM             -> this visit (unless it is
 *    the same campaign params already stored, then keep the stored record so
 *    the original landing time survives a page refresh)
 *  - stored is a bare direct visit and this one has an external referrer
 *                                                    -> this visit (upgrade)
 *  - otherwise                                       -> stored
 */
export function mergeAttribution(stored: Attribution | null | undefined, visit: Attribution, now = new Date()): Attribution {
  if (!stored || isExpired(stored, now)) return visit;
  if (hasCampaignSignal(visit)) {
    return hasCampaignSignal(stored) && sameCampaign(stored, visit) ? stored : visit;
  }
  if (!hasCampaignSignal(stored) && !stored.referrer && visit.referrer) return visit;
  return stored;
}

// ----- lead-source classification (used by the Worker) -----

const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'paid-search', 'paid_social', 'paid-social', 'paidsocial', 'display', 'lsa', 'sem']);

const SOURCE_NAMES: Record<string, string> = {
  google: 'Google',
  gbp: 'Google Business Profile',
  'google-business': 'Google Business Profile',
  bing: 'Bing',
  facebook: 'Facebook',
  fb: 'Facebook',
  instagram: 'Instagram',
  ig: 'Instagram',
  nextdoor: 'Nextdoor',
  yelp: 'Yelp',
  substack: 'Substack',
  newsletter: 'Newsletter',
  email: 'Email',
  stannp: 'Direct Mail',
  mail: 'Direct Mail',
  directmail: 'Direct Mail',
  'direct-mail': 'Direct Mail',
  qr: 'QR Code',
  flyer: 'Flyer',
  linkedin: 'LinkedIn',
};

function prettySource(raw: string): string {
  const k = raw.trim().toLowerCase();
  if (SOURCE_NAMES[k]) return SOURCE_NAMES[k];
  return k
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function referrerSource(referrer: string): string {
  let host = '';
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'Referral';
  }
  if (/(^|\.)google\./.test(host)) return 'Google Organic';
  if (/(^|\.)bing\.com$/.test(host)) return 'Bing Organic';
  if (/(^|\.)duckduckgo\.com$/.test(host)) return 'DuckDuckGo Organic';
  if (/(^|\.)yahoo\./.test(host)) return 'Yahoo Organic';
  if (/(^|\.)(facebook\.com|fb\.com|messenger\.com)$/.test(host)) return 'Facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram';
  if (/(^|\.)nextdoor\.com$/.test(host)) return 'Nextdoor';
  if (/(^|\.)yelp\.com$/.test(host)) return 'Yelp';
  if (/(^|\.)(x\.com|twitter\.com|t\.co)$/.test(host)) return 'X';
  if (/(^|\.)linkedin\.com$/.test(host)) return 'LinkedIn';
  return `Referral: ${host}`;
}

export interface ClassifyOptions {
  /** Label of the printed piece behind a valid promo code (e.g. "Door hanger"). */
  promoPiece?: string;
}

/**
 * One short label for Jobber's lead-source field. Precedence:
 *  Google click id > paid UTM > any UTM source > promo code piece > external
 *  referrer > "Website (direct)".
 */
export function classifyLeadSource(a: Partial<Attribution> | null | undefined, opts: ClassifyOptions = {}): string {
  const x = a ?? {};
  if (x.gclid || x.gbraid || x.wbraid) return 'Google Ads';
  const medium = (x.utmMedium ?? '').trim().toLowerCase();
  if (x.utmSource && PAID_MEDIUMS.has(medium)) return `${prettySource(x.utmSource)} Ads`;
  if (x.utmSource) return prettySource(x.utmSource);
  if (opts.promoPiece?.trim()) return `Print: ${opts.promoPiece.trim()}`;
  if (x.referrer) return referrerSource(x.referrer);
  return 'Website (direct)';
}

// ----- browser wrappers (all storage access wrapped in try/catch) -----

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WindowLike {
  location: { search: string; pathname: string; hostname: string };
  document: { referrer: string };
  localStorage?: StorageLike;
}

export function readStoredAttribution(storage: StorageLike | undefined): Attribution | null {
  try {
    const raw = storage?.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

/**
 * Capture this page view into localStorage (merged with any prior record) and
 * return the record that should be attached to a lead submitted right now.
 * Safe to call on every page and again at submit time (idempotent).
 */
export function captureAttribution(win: WindowLike, now = new Date(), siteHost = SITE_HOST): Attribution {
  const visit = parseVisit({
    search: win.location.search ?? '',
    referrer: win.document.referrer ?? '',
    pathname: win.location.pathname ?? '/',
    now,
    siteHost,
  });
  let storage: StorageLike | undefined;
  try {
    storage = win.localStorage;
  } catch {
    storage = undefined;
  }
  const stored = readStoredAttribution(storage);
  const merged = mergeAttribution(stored, visit, now);
  if (merged !== stored) {
    try {
      storage?.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* private mode / quota / blocked storage — the lead still carries `merged` */
    }
  }
  return merged;
}
