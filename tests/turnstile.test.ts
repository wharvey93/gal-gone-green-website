import { afterEach, describe, expect, test, vi } from 'vitest';
import { forwardAllowed, verifyTurnstile } from '../functions/api/turnstile';
import { handleSubmitQuote } from '../functions/api/submit-quote';
import { calculate } from '../src/lib/pricing';
import { toQuoteInputs } from '../functions/api/desk-forward';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('verifyTurnstile', () => {
  test('off until the secret is set', async () => {
    expect(await verifyTurnstile({}, 'tok', null, vi.fn() as never)).toBe('off');
  });
  test('pass, fail, and Cloudflare trouble counted as unavailable', async () => {
    const env = { TURNSTILE_SECRET_KEY: 'sek' };
    expect(await verifyTurnstile(env, 'tok', '1.2.3.4', (async () => ok({ success: true })) as never)).toBe('pass');
    expect(await verifyTurnstile(env, 'tok', null, (async () => ok({ success: false, 'error-codes': ['invalid-input-response'] })) as never)).toBe('fail');
    expect(await verifyTurnstile(env, '', null, vi.fn() as never)).toBe('fail');
    expect(await verifyTurnstile(env, undefined, null, vi.fn() as never)).toBe('fail');
    expect(await verifyTurnstile(env, 'tok', null, (async () => ok({ success: false, 'error-codes': ['internal-error'] })) as never)).toBe('unavailable');
    expect(await verifyTurnstile(env, 'tok', null, (async () => new Response('', { status: 503 })) as never)).toBe('unavailable');
    expect(await verifyTurnstile(env, 'tok', null, (async () => { throw new TypeError('down'); }) as never)).toBe('unavailable');
  });
  test('only pass and off reach the desk', () => {
    expect(['pass', 'fail', 'unavailable', 'off'].map((r) => forwardAllowed(r as never))).toEqual([true, false, false, true]);
  });
});

// The whole submit path with every outside service faked: the customer's quote must succeed in every Turnstile state.
describe('submit never blocked by Turnstile', () => {
  afterEach(() => vi.unstubAllGlobals());

  function quote(token?: string) {
    const s: Record<string, unknown> = {
      serviceType: 'residential-recurring', frequency: 'biweekly', squareFootage: '1500-2000', bedrooms: 3, bathrooms: 2, pets: 'none',
      finishedBasement: false, extraLivingSpaces: 0, zip: '22815', name: 'Test Person', phone: '(540) 555-0100', email: 't@example.com',
      propertyAddress: '1 Test Rd, Broadway, VA', turnstileToken: token,
    };
    const r = calculate(toQuoteInputs(s as never)!);
    Object.assign(s, { calculatedPrice: r.price, basePrice: r.basePrice, firstCleanPrice: r.firstCleanPrice, isOutlier: r.isOutlier,
      isOutOfArea: r.isOutOfArea, travelSurchargeApplied: r.travelSurchargeApplied, travelSurcharge: r.travelSurcharge });
    return new Request('https://x.test/api/submit-quote', { method: 'POST', body: JSON.stringify(s), headers: { 'content-type': 'application/json' } });
  }

  async function run(siteverify: () => Promise<Response>, token = 'tok') {
    const desk: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('siteverify')) return siteverify();
      if (url.includes('desk.test')) { desk.push(url); return new Response('{}', { status: 201 }); }
      return new Response('nope', { status: 401 }); // Jobber: fails, so the quote takes the email fallback
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = {
      JOBBER_CLIENT_ID: 'x', JOBBER_CLIENT_SECRET: 'x', JOBBER_REFRESH_TOKEN: 'x', RESEND_API_KEY: '',
      TURNSTILE_SECRET_KEY: 'sek', OPS_HQ_QUOTE_URL: 'https://desk.test/hook', GGG_QUOTE_FORWARD_SECRET: 's'.repeat(40),
    };
    const res = await handleSubmitQuote(quote(token), env as never);
    return { status: res.status, body: (await res.json()) as { ok: boolean }, desk };
  }

  test('pass: quote ok and forwarded', async () => {
    const r = await run(async () => ok({ success: true }));
    expect(r.body.ok).toBe(true);
    expect(r.desk).toHaveLength(1);
  });
  test('failed token: quote ok, not forwarded', async () => {
    const r = await run(async () => ok({ success: false, 'error-codes': ['invalid-input-response'] }));
    expect(r.body.ok).toBe(true);
    expect(r.desk).toHaveLength(0);
  });
  test('Turnstile down: quote ok, not forwarded', async () => {
    const r = await run(async () => { throw new TypeError('down'); });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.desk).toHaveLength(0);
  });
});
