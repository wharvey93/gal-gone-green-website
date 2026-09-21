import { describe, expect, test } from 'vitest';
import {
  ATTRIBUTION_STORAGE_KEY,
  captureAttribution,
  classifyLeadSource,
  externalReferrer,
  hasCampaignSignal,
  isExpired,
  mergeAttribution,
  parseVisit,
  readStoredAttribution,
  type Attribution,
} from '../src/lib/attribution';

const NOW = new Date('2026-09-21T15:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

describe('externalReferrer', () => {
  test('drops internal referrers and empties', () => {
    expect(externalReferrer('')).toBeUndefined();
    expect(externalReferrer('https://galgonegreen.com/residential/')).toBeUndefined();
    expect(externalReferrer('https://www.galgonegreen.com/')).toBeUndefined();
    expect(externalReferrer('https://preview.galgonegreen.com/quote')).toBeUndefined();
    expect(externalReferrer('not a url')).toBeUndefined();
  });
  test('keeps external referrers', () => {
    expect(externalReferrer('https://www.google.com/')).toBe('https://www.google.com/');
    expect(externalReferrer('https://galgonegreen.com.evil.example/')).toBe('https://galgonegreen.com.evil.example/');
  });
});

describe('parseVisit', () => {
  test('reads click ids, UTMs, external referrer, landing page', () => {
    const a = parseVisit({
      search: '?gclid=abc123&utm_source=google&utm_medium=cpc&utm_campaign=valley&foo=bar',
      referrer: 'https://www.google.com/',
      pathname: '/areas/harrisonburg/',
      now: NOW,
    });
    expect(a).toEqual({
      gclid: 'abc123',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'valley',
      referrer: 'https://www.google.com/',
      landingPage: '/areas/harrisonburg/?gclid=abc123&utm_source=google&utm_medium=cpc&utm_campaign=valley&foo=bar',
      capturedAt: NOW.toISOString(),
    });
  });
  test('captures gbraid / wbraid (iOS click ids)', () => {
    expect(parseVisit({ search: '?wbraid=w1', referrer: '', pathname: '/', now: NOW }).wbraid).toBe('w1');
    expect(parseVisit({ search: '?gbraid=g1', referrer: '', pathname: '/', now: NOW }).gbraid).toBe('g1');
  });
  test('bare direct visit has only landing + timestamp', () => {
    const a = parseVisit({ search: '', referrer: '', pathname: '/quote/', now: NOW });
    expect(a).toEqual({ landingPage: '/quote/', capturedAt: NOW.toISOString() });
    expect(hasCampaignSignal(a)).toBe(false);
  });
  test('clips absurdly long values', () => {
    const a = parseVisit({ search: '?gclid=' + 'x'.repeat(1000), referrer: '', pathname: '/', now: NOW });
    expect(a.gclid!.length).toBe(400);
  });
});

describe('isExpired', () => {
  test('90-day TTL', () => {
    expect(isExpired({ capturedAt: daysAgo(89) }, NOW)).toBe(false);
    expect(isExpired({ capturedAt: daysAgo(91) }, NOW)).toBe(true);
    expect(isExpired({}, NOW)).toBe(true);
    expect(isExpired({ capturedAt: 'garbage' }, NOW)).toBe(true);
    expect(isExpired(null, NOW)).toBe(true);
  });
});

describe('mergeAttribution', () => {
  const paid: Attribution = { gclid: 'g1', landingPage: '/areas/staunton/?gclid=g1', capturedAt: daysAgo(3) };
  const direct = (d = 0): Attribution => ({ landingPage: '/quote/', capturedAt: daysAgo(d) });

  test('ad click on any page survives a later direct visit to /quote (the bug being fixed)', () => {
    expect(mergeAttribution(paid, direct(), NOW)).toBe(paid);
  });
  test('no stored record -> this visit', () => {
    const v = direct();
    expect(mergeAttribution(null, v, NOW)).toBe(v);
  });
  test('expired stored record -> this visit', () => {
    const old: Attribution = { gclid: 'old', capturedAt: daysAgo(120) };
    const v = direct();
    expect(mergeAttribution(old, v, NOW)).toBe(v);
  });
  test('a NEW click id replaces the old one (last paid click wins)', () => {
    const v: Attribution = { gclid: 'g2', landingPage: '/', capturedAt: NOW.toISOString() };
    expect(mergeAttribution(paid, v, NOW)).toBe(v);
  });
  test('refresh of the same campaign landing keeps the original timestamp', () => {
    const v: Attribution = { gclid: 'g1', landingPage: '/areas/staunton/?gclid=g1', capturedAt: NOW.toISOString() };
    expect(mergeAttribution(paid, v, NOW)).toBe(paid);
  });
  test('UTM-tagged visit replaces a stored organic/direct touch', () => {
    const organic: Attribution = { referrer: 'https://www.google.com/', landingPage: '/', capturedAt: daysAgo(2) };
    const v: Attribution = { utmSource: 'substack', utmMedium: 'email', landingPage: '/', capturedAt: NOW.toISOString() };
    expect(mergeAttribution(organic, v, NOW)).toBe(v);
  });
  test('stored direct + new external referrer -> upgrade to the referral', () => {
    const v: Attribution = { referrer: 'https://www.bing.com/', landingPage: '/', capturedAt: NOW.toISOString() };
    expect(mergeAttribution(direct(5), v, NOW)).toBe(v);
  });
  test('stored organic touch beats a later direct visit', () => {
    const organic: Attribution = { referrer: 'https://www.google.com/', landingPage: '/', capturedAt: daysAgo(2) };
    expect(mergeAttribution(organic, direct(), NOW)).toBe(organic);
  });
});

describe('classifyLeadSource', () => {
  test('any Google click id -> Google Ads, regardless of UTMs', () => {
    expect(classifyLeadSource({ gclid: 'x' })).toBe('Google Ads');
    expect(classifyLeadSource({ wbraid: 'x', referrer: 'https://www.google.com/' })).toBe('Google Ads');
    expect(classifyLeadSource({ gbraid: 'x', utmSource: 'substack' })).toBe('Google Ads');
  });
  test('paid UTM medium -> "<Source> Ads"', () => {
    expect(classifyLeadSource({ utmSource: 'facebook', utmMedium: 'paid_social' })).toBe('Facebook Ads');
    expect(classifyLeadSource({ utmSource: 'bing', utmMedium: 'CPC' })).toBe('Bing Ads');
  });
  test('non-paid UTM source -> pretty source name', () => {
    expect(classifyLeadSource({ utmSource: 'substack', utmMedium: 'email' })).toBe('Substack');
    expect(classifyLeadSource({ utmSource: 'gbp' })).toBe('Google Business Profile');
    expect(classifyLeadSource({ utmSource: 'stannp', utmMedium: 'mail' })).toBe('Direct Mail');
    expect(classifyLeadSource({ utmSource: 'valley_moms-group' })).toBe('Valley Moms Group');
  });
  test('promo piece beats organic referrer but not paid', () => {
    expect(classifyLeadSource({ referrer: 'https://www.google.com/' }, { promoPiece: 'Door hanger' })).toBe('Print: Door hanger');
    expect(classifyLeadSource({ gclid: 'x' }, { promoPiece: 'Door hanger' })).toBe('Google Ads');
  });
  test('referrer classification', () => {
    expect(classifyLeadSource({ referrer: 'https://www.google.com/' })).toBe('Google Organic');
    expect(classifyLeadSource({ referrer: 'https://www.google.co.uk/search?q=x' })).toBe('Google Organic');
    expect(classifyLeadSource({ referrer: 'https://www.bing.com/' })).toBe('Bing Organic');
    expect(classifyLeadSource({ referrer: 'https://duckduckgo.com/' })).toBe('DuckDuckGo Organic');
    expect(classifyLeadSource({ referrer: 'https://l.facebook.com/l.php?u=x' })).toBe('Facebook');
    expect(classifyLeadSource({ referrer: 'https://nextdoor.com/p/abc' })).toBe('Nextdoor');
    expect(classifyLeadSource({ referrer: 'https://www.yelp.com/biz/x' })).toBe('Yelp');
    expect(classifyLeadSource({ referrer: 'https://www.harrisonburgmoms.example/' })).toBe('Referral: harrisonburgmoms.example');
    expect(classifyLeadSource({ referrer: 'https://notgoogle.com/' })).toBe('Referral: notgoogle.com');
  });
  test('nothing -> Website (direct)', () => {
    expect(classifyLeadSource({})).toBe('Website (direct)');
    expect(classifyLeadSource(null)).toBe('Website (direct)');
    expect(classifyLeadSource({ landingPage: '/quote/', capturedAt: NOW.toISOString() })).toBe('Website (direct)');
  });
});

// ----- browser wrapper with a fake window -----

function fakeWindow(opts: { search?: string; pathname?: string; referrer?: string; storage?: Map<string, string> | 'throws' | 'none' }) {
  const map = opts.storage instanceof Map ? opts.storage : new Map<string, string>();
  const storageObj = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (opts.storage === 'throws') throw new Error('QuotaExceededError');
      map.set(k, v);
    },
  };
  const win: any = {
    location: { search: opts.search ?? '', pathname: opts.pathname ?? '/', hostname: 'galgonegreen.com' },
    document: { referrer: opts.referrer ?? '' },
  };
  if (opts.storage === 'throws') {
    Object.defineProperty(win, 'localStorage', { get() { throw new Error('SecurityError'); } });
  } else if (opts.storage !== 'none') {
    win.localStorage = storageObj;
  }
  return { win, map };
}

describe('captureAttribution (browser wrapper)', () => {
  test('ad landing on a location page, then direct /quote submit keeps the gclid', () => {
    const store = new Map<string, string>();
    const land = fakeWindow({ search: '?gclid=G1', pathname: '/areas/waynesboro/', referrer: 'https://www.google.com/', storage: store });
    const first = captureAttribution(land.win, NOW);
    expect(first.gclid).toBe('G1');
    expect(JSON.parse(store.get(ATTRIBUTION_STORAGE_KEY)!)).toEqual(first);

    const later = new Date(NOW.getTime() + 2 * 86400000);
    const quote = fakeWindow({ search: '', pathname: '/quote/', referrer: 'https://galgonegreen.com/areas/waynesboro/', storage: store });
    const atSubmit = captureAttribution(quote.win, later);
    expect(atSubmit).toEqual(first);
    expect(classifyLeadSource(atSubmit)).toBe('Google Ads');
  });
  test('storage unavailable: still returns this visit, does not throw', () => {
    const { win } = fakeWindow({ search: '?gclid=G2', storage: 'throws' });
    const a = captureAttribution(win, NOW);
    expect(a.gclid).toBe('G2');
    const { win: w2 } = fakeWindow({ search: '?gclid=G3', storage: 'none' });
    expect(captureAttribution(w2, NOW).gclid).toBe('G3');
  });
  test('corrupt stored JSON is ignored', () => {
    const store = new Map([[ATTRIBUTION_STORAGE_KEY, '{not json']]);
    expect(readStoredAttribution({ getItem: (k) => store.get(k) ?? null, setItem: () => {} })).toBeNull();
    const { win } = fakeWindow({ search: '?gclid=G4', storage: store });
    expect(captureAttribution(win, NOW).gclid).toBe('G4');
  });
});
