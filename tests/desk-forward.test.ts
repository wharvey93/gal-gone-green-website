import { describe, expect, test, vi } from 'vitest';
import { calculate } from '../src/lib/pricing';
import { buildDeskPayload, checkPrice, forwardToDesk, toQuoteInputs } from '../functions/api/desk-forward';

// A submission the way QuoteCalculator posts it, with the price the engine itself produces.
function submission(over: Record<string, unknown> = {}) {
  const s = {
    serviceType: 'residential-recurring',
    frequency: 'biweekly',
    squareFootage: '1500-2000',
    bedrooms: 3,
    bathrooms: 2,
    pets: 'none',
    finishedBasement: false,
    extraLivingSpaces: 0,
    zip: '22815',
    name: 'Jane Doe',
    phone: '(540) 555-0123',
    email: 'jane@example.com',
    propertyAddress: '123 Main St, Broadway, VA',
    propertyStreet: '123 Main St',
    propertyCity: 'Broadway',
    propertyState: 'VA',
    preferredStartDate: '2026-11-20',
    ...over,
  } as Record<string, unknown>;
  const r = calculate(toQuoteInputs(s as never)!);
  return {
    calculatedPrice: r.price,
    basePrice: r.basePrice,
    firstCleanPrice: r.firstCleanPrice,
    isOutlier: r.isOutlier,
    outlierReason: r.outlierReason ?? undefined,
    isOutOfArea: r.isOutOfArea,
    travelSurchargeApplied: r.travelSurchargeApplied,
    travelSurcharge: r.travelSurcharge,
    ...s,
  } as never;
}

describe('price re-check', () => {
  test('the engine agrees with an honest form submission', () => {
    expect(checkPrice(submission()).priceCheck).toBe('match');
    expect(checkPrice(submission({ zip: '22980' })).priceCheck).toBe('match'); // Ring 2 travel
    expect(checkPrice(submission({ serviceType: 'move-out', moveBedrooms: 3, moveAddons: { garage: true } })).priceCheck).toBe('match');
  });

  test('a tampered price is flagged with the real number', () => {
    const s = { ...(submission() as object), calculatedPrice: 50 } as never;
    const c = checkPrice(s);
    expect(c.priceCheck).toBe('mismatch');
    expect(c.serverPrice).toBe(checkPrice(submission()).serverPrice);
  });

  test('an unknown service is not checked', () => {
    expect(checkPrice({ ...(submission() as object), serviceType: 'pool' } as never).priceCheck).toBe('not-checked');
  });
});

describe('desk payload', () => {
  test('carries only the fields Ops HQ accepts, trimmed', () => {
    const p = buildDeskPayload(submission(), { submissionId: 'abc12345-sub', leadSource: 'Google Ads', jobberClientCreated: true, now: new Date('2026-11-12T12:00:00Z') });
    expect(Object.keys(p).sort()).toEqual([
      'address', 'basePrice', 'city', 'details', 'email', 'firstCleanPrice', 'frequency', 'isOutOfArea', 'isOutlier', 'jobberClientCreated',
      'leadSource', 'name', 'outlierReason', 'phone', 'preferredStartDate', 'price', 'priceCheck', 'promoCode', 'serverFirstCleanPrice',
      'serverPrice', 'serviceType', 'state', 'street', 'submissionId', 'submittedAt', 'travelSurcharge', 'travelSurchargeApplied', 'zip',
    ]);
    expect(p.address).toBe('123 Main St, Broadway, VA 22815');
    expect(p.priceCheck).toBe('match');
  });
});

describe('forward', () => {
  const payload = buildDeskPayload(submission(), { submissionId: 'abc12345-sub', leadSource: 'x', jobberClientCreated: true });

  test('does nothing until both the URL and the secret are set, or when the URL is not https', async () => {
    const f = vi.fn();
    expect(await forwardToDesk({}, payload, f as never)).toBe('skipped');
    expect(await forwardToDesk({ OPS_HQ_QUOTE_URL: 'https://x.test/h' }, payload, f as never)).toBe('skipped');
    expect(await forwardToDesk({ OPS_HQ_QUOTE_URL: 'http://x.test/h', GGG_QUOTE_FORWARD_SECRET: 's' }, payload, f as never)).toBe('skipped');
    expect(f).not.toHaveBeenCalled();
  });

  test('posts JSON with the secret header', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 201 }));
    expect(await forwardToDesk({ OPS_HQ_QUOTE_URL: 'https://x.test/h', GGG_QUOTE_FORWARD_SECRET: 'sek' }, payload, f as never)).toBe('sent');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/h');
    expect((init.headers as Record<string, string>)['x-ggg-quote-secret']).toBe('sek');
    expect(JSON.parse(init.body as string).submissionId).toBe('abc12345-sub');
  });

  test('never throws: an error answer or a network failure is reported as failed', async () => {
    const env = { OPS_HQ_QUOTE_URL: 'https://x.test/h', GGG_QUOTE_FORWARD_SECRET: 'sek' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await forwardToDesk(env, payload, (async () => new Response('', { status: 500 })) as never)).toBe('failed');
    expect(await forwardToDesk(env, payload, (async () => { throw new TypeError('network'); }) as never)).toBe('failed');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Jane');
    spy.mockRestore();
  });
});
