// Cloudflare Turnstile check for the quote form (CEO yes, 12 Nov 2026).
//
// Policy: Turnstile NEVER blocks a customer's quote. Every valid submission still goes to Jobber and the email
// exactly as before. Turnstile only decides whether the quote also goes on the desk fast path (Ops HQ, phone alert):
//   pass          -> forwarded
//   fail          -> not forwarded (no token, a bad or reused token): the email is marked so a person still sees it
//   unavailable   -> not forwarded (Turnstile's API down or slow): fail closed for the desk only; the email says so
//   off           -> forwarded (TURNSTILE_SECRET_KEY not set yet: Turnstile is not switched on)
// The secret is read from env by name only and never logged.

export interface TurnstileEnv {
  TURNSTILE_SECRET_KEY?: string;
}

export type TurnstileResult = 'pass' | 'fail' | 'unavailable' | 'off';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  env: TurnstileEnv,
  token: unknown,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return 'off';
  if (typeof token !== 'string' || !token || token.length > 2048) return 'fail';
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return 'unavailable';
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success === true) return 'pass';
    // Cloudflare's own failure (not the visitor's) counts as unavailable, never as a bad visitor.
    const codes = data['error-codes'] ?? [];
    if (codes.includes('internal-error') || codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
      return 'unavailable';
    }
    return 'fail';
  } catch {
    return 'unavailable';
  }
}

/** The desk fast path runs only on these. */
export function forwardAllowed(r: TurnstileResult): boolean {
  return r === 'pass' || r === 'off';
}
