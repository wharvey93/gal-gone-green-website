// Cloudflare Pages Function — POST /api/submit-quote
//
// Called by the QuoteCalculator on /quote when a customer clicks "Book this
// price." Creates a Jobber Client + Request with the calculated price in the
// description. Falls back to Resend email to hello@galgonegreen.com if the
// Jobber API fails, so we never lose a lead.

interface Env {
  JOBBER_CLIENT_ID: string;
  JOBBER_CLIENT_SECRET: string;
  JOBBER_REFRESH_TOKEN: string;
  RESEND_API_KEY: string;
  // Comma-separated list of recipients for notification emails.
  // e.g. "will@harvey-capital.com,hello@galgonegreen.com"
  NOTIFY_EMAILS?: string;
  NOTIFY_FROM_EMAIL?: string;
}

// Mirrors what the client-side QuoteCalculator posts.
interface QuoteSubmission {
  calculatedPrice: number | null;
  firstCleanPrice?: number | null;
  isOutlier: boolean;
  outlierReason?: string;
  isOutOfArea: boolean;
  travelSurchargeApplied: boolean;

  serviceType: string;
  frequency?: string;

  squareFootage?: string;
  bedrooms?: number;
  bathrooms?: number;
  pets?: string;
  finishedBasement?: boolean;
  extraLivingSpaces?: number;

  // move / str / commercial
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
  // Structured address fields — present when user picked from Places
  // autocomplete. Fall back to propertyAddress if missing.
  propertyStreet?: string;
  propertyCity?: string;
  propertyState?: string;
  details?: string;

  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  referrer?: string;
}

const JOBBER_TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';
const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Plain handler — callable from either a Pages Function wrapper or a Worker.
export async function handleSubmitQuote(request: Request, env: Env): Promise<Response> {
  let submission: QuoteSubmission;
  try {
    submission = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const errors = validate(submission);
  if (errors.length) return json({ ok: false, errors }, 400);

  let jobberClientId: string | undefined;
  let jobberNoteId: string | undefined;
  let jobberError: string | undefined;
  try {
    const accessToken = await refreshAccessToken(env);
    const client = await upsertClient(accessToken, submission);
    jobberClientId = client.id;
    const note = await createClientNote(accessToken, client.id, submission);
    jobberNoteId = note.id;
  } catch (err) {
    jobberError = err instanceof Error ? err.message : String(err);
    console.error('Jobber submission failed:', jobberError);
  }

  // Fire notification email on every submission — Wilkins + Will get pinged
  // whether Jobber worked or not. If Jobber failed the email flags it so
  // Wilkins knows to create the lead manually.
  await sendNotificationEmail(env, submission, { jobberClientId, jobberError }).catch((e) => {
    console.error('Resend notification failed:', e instanceof Error ? e.message : e);
  });

  return json({
    ok: true,
    jobberClientId,
    jobberNoteId,
    fallback: !!jobberError,
  });
}

// Pages Functions compatibility wrapper (kept for future if CF re-enables).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) =>
  handleSubmitQuote(request, env);

export type { Env };

// ----- validation -----

function validate(s: QuoteSubmission): string[] {
  const errs: string[] = [];
  if (!s.name?.trim()) errs.push('name required');
  if (!s.phone?.trim()) errs.push('phone required');
  if (!s.email?.trim()) errs.push('email required');
  if (!/.+@.+\..+/.test(s.email ?? '')) errs.push('email invalid');
  if (!s.propertyAddress?.trim()) errs.push('property address required');
  if (!s.serviceType) errs.push('service type required');
  return errs;
}

// ----- Jobber OAuth -----

async function refreshAccessToken(env: Env): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.JOBBER_CLIENT_ID,
    client_secret: env.JOBBER_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: env.JOBBER_REFRESH_TOKEN,
  });
  const res = await fetch(JOBBER_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber token refresh failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  if (!data.access_token) throw new Error('Jobber token response missing access_token');
  return data.access_token;
}

// ----- Jobber GraphQL -----

async function gql<T>(accessToken: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `bearer ${accessToken}`,
      // Pin to a version Jobber still actively supports. Without this pin,
      // Jobber defaults to an expired version (2024-04-25) and 404s.
      // Check active versions at developer.getjobber.com/docs/changelog/
      // before rolling this forward; old versions get 12-month deprecation.
      'X-JOBBER-GRAPHQL-VERSION': '2025-04-16',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber GraphQL HTTP ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) {
    throw new Error(`Jobber GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  if (!body.data) throw new Error('Jobber GraphQL returned empty data');
  return body.data;
}

interface JobberClient {
  id: string;
  firstName?: string;
  lastName?: string;
}

async function upsertClient(accessToken: string, s: QuoteSubmission): Promise<JobberClient> {
  const { firstName, lastName } = splitName(s.name);
  const query = `
    mutation CreateClient($input: ClientCreateInput!) {
      clientCreate(input: $input) {
        client { id firstName lastName }
        userErrors { message path }
      }
    }
  `;
  const input = {
    firstName,
    lastName,
    emails: [{ description: 'MAIN', primary: true, address: s.email }],
    phones: [{ description: 'MAIN', primary: true, number: s.phone }],
    billingAddress: {
      // Prefer structured fields from Places autocomplete. If the user typed
      // freely without picking, fall back to their raw text as street1 (city/
      // zip stay empty — Wilkins can clean up in Jobber).
      street1: s.propertyStreet ?? s.propertyAddress,
      city: s.propertyCity,
      province: s.propertyState || 'Virginia',
      postalCode: s.zip,
      country: 'United States',
    },
  };
  type Res = { clientCreate: { client: JobberClient | null; userErrors: { message: string; path: string[] }[] } };
  const data = await gql<Res>(accessToken, query, { input });
  const { client, userErrors } = data.clientCreate;
  if (client) return client;
  // If Jobber rejects as duplicate (common when a prospect resubmits),
  // surface the error — Wilkins can dedupe in Jobber. We don't silently
  // overwrite the existing client's contact info.
  const msg = userErrors?.map((e) => e.message).join('; ') ?? 'unknown clientCreate error';
  throw new Error(`clientCreate rejected: ${msg}`);
}

interface JobberClientNote {
  id: string;
}

// Jobber's "Request" mutation requires a pre-configured Request Form in the
// Jobber dashboard and uses that form's schema — too rigid for our free-form
// pricing data. Instead we attach a pinned Note to the Client with the full
// quote context. Wilkins sees the new Client in his Jobber contacts; opens
// it; the pinned note has everything he needs to send a Quote.
async function createClientNote(
  accessToken: string,
  clientId: string,
  s: QuoteSubmission,
): Promise<JobberClientNote> {
  const query = `
    mutation CreateClientNote($clientId: EncodedId!, $input: ClientCreateNoteInput!) {
      clientCreateNote(clientId: $clientId, input: $input) {
        clientNote { id }
        userErrors { message path }
      }
    }
  `;
  const input = {
    message: formatDescription(s),
    pinned: true,
  };
  type Res = {
    clientCreateNote: {
      clientNote: JobberClientNote | null;
      userErrors: { message: string; path: string[] }[];
    };
  };
  const data = await gql<Res>(accessToken, query, { clientId, input });
  const { clientNote, userErrors } = data.clientCreateNote;
  if (clientNote) return clientNote;
  const msg = userErrors?.map((e) => e.message).join('; ') ?? 'unknown clientCreateNote error';
  throw new Error(`clientCreateNote rejected: ${msg}`);
}

// ----- formatting helpers -----

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

function friendlyService(st: string): string {
  const map: Record<string, string> = {
    'residential-recurring': 'Recurring residential',
    'deep-clean': 'One-time deep clean',
    'move-out': 'Move-out cleaning',
    'move-in': 'Move-in cleaning',
    'str-turnover': 'Vacation rental turnover',
    commercial: 'Commercial / office',
  };
  return map[st] ?? st;
}

function formatDescription(s: QuoteSubmission): string {
  const lines: string[] = [];
  lines.push('INSTANT QUOTE from galgonegreen.com');
  lines.push('');
  if (s.isOutlier) {
    lines.push(`🔍 ASSESSMENT REQUIRED — ${s.outlierReason ?? 'flagged input'}`);
  } else if (s.calculatedPrice !== null) {
    const per = s.serviceType === 'residential-recurring'
      ? ` / ${s.frequency ?? 'clean'}`
      : s.serviceType === 'str-turnover' ? ' / turnover' : '';
    lines.push(`💰 Calculated Price: $${s.calculatedPrice}${per}`);
    if (s.firstCleanPrice) lines.push(`   First clean (1.5×): $${s.firstCleanPrice}`);
    if (s.travelSurchargeApplied) lines.push('   (includes $25 Ring 2 travel surcharge)');
  }
  lines.push('');
  lines.push(`🏠 Service: ${friendlyService(s.serviceType)}`);
  if (s.frequency) lines.push(`📅 Frequency: ${s.frequency}`);

  if (s.serviceType === 'residential-recurring' || s.serviceType === 'deep-clean') {
    const parts: string[] = [];
    if (s.squareFootage) parts.push(s.squareFootage);
    if (s.bedrooms) parts.push(`${s.bedrooms} BR`);
    if (s.bathrooms) parts.push(`${s.bathrooms} BA`);
    if (parts.length) lines.push(`📐 Home: ${parts.join(' / ')}`);
    if (s.pets) lines.push(`🐾 Pets: ${s.pets}`);
    if (s.finishedBasement) lines.push('🏚️ Finished basement: yes');
    if (s.extraLivingSpaces) lines.push(`🛋️ Extra living spaces: ${s.extraLivingSpaces}`);
  }

  if (s.serviceType === 'move-out' || s.serviceType === 'move-in') {
    lines.push(`🛏️ Bedrooms: ${s.moveBedrooms ?? '?'}`);
    if (s.pmBulk) lines.push('🏢 Property manager bulk rate');
    const ad = s.moveAddons ?? {};
    const addons = [
      ad.garage && 'Garage',
      ad.trashInside && 'Trash (inside)',
      ad.insideOutsideTrash && 'Trash (inside+outside)',
      ad.carpetRooms && `Carpet x${ad.carpetRooms}`,
      ad.insideAppliances && 'Appliances',
    ].filter(Boolean);
    if (addons.length) lines.push(`➕ Add-ons: ${addons.join(', ')}`);
  }

  if (s.serviceType === 'str-turnover') {
    lines.push(`🛏️ Bedrooms: ${s.strBedrooms ?? '?'}`);
    const ad = s.strAddons ?? {};
    const addons = [
      ad.laundry && 'Laundry',
      ad.trash && 'Trash',
      ad.hotTub && 'Hot tub',
      ad.outdoor && 'Outdoor',
    ].filter(Boolean);
    if (addons.length) lines.push(`➕ Add-ons: ${addons.join(', ')}`);
  }

  if (s.serviceType === 'commercial') {
    lines.push(`📐 ${s.commercialSqft ?? '?'} · ${s.facilityType ?? '?'}`);
    if (s.restrooms) lines.push(`🚻 Restrooms: ${s.restrooms}`);
    if (s.breakrooms) lines.push(`☕ Breakrooms: ${s.breakrooms}`);
  }

  const flags = [
    s.heavyClutter && 'heavy clutter',
    s.smokeOdor && 'smoke/odor',
    s.hoarding && 'hoarding',
    s.biohazard && 'biohazard',
  ].filter(Boolean);
  if (flags.length) lines.push(`🚩 Flags: ${flags.join(', ')}`);

  lines.push('');
  // Compose a clean address line from structured fields if we have them,
  // otherwise fall back to the raw string the customer typed.
  const structuredLine = [
    s.propertyStreet,
    s.propertyCity,
    [s.propertyState, s.zip].filter(Boolean).join(' ') || undefined,
  ]
    .filter(Boolean)
    .join(', ');
  lines.push(`📍 ${structuredLine || s.propertyAddress}`);
  if (s.preferredStartDate) lines.push(`🗓️ Preferred start: ${s.preferredStartDate}`);

  const attribution = [
    s.utmSource && `source=${s.utmSource}`,
    s.utmMedium && `medium=${s.utmMedium}`,
    s.utmCampaign && `campaign=${s.utmCampaign}`,
    s.gclid && `gclid=${s.gclid}`,
  ].filter(Boolean);
  if (attribution.length) lines.push(`📊 ${attribution.join(' · ')}`);
  if (s.referrer) lines.push(`🔗 Referrer: ${s.referrer}`);

  lines.push('');
  lines.push('──────────────────────────');
  lines.push(`👤 ${s.name}`);
  lines.push(`📞 ${s.phone}`);
  lines.push(`✉️  ${s.email}`);
  if (s.details) {
    lines.push('');
    lines.push('📝 Notes:');
    lines.push(s.details);
  }
  lines.push('');
  lines.push(`Submitted: ${new Date().toISOString()}`);

  return lines.join('\n');
}

// ----- Resend notification -----

interface NotifyContext {
  jobberClientId?: string;
  jobberError?: string;
}

async function sendNotificationEmail(
  env: Env,
  s: QuoteSubmission,
  ctx: NotifyContext,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set — cannot send notification email');
    return;
  }
  const to = (env.NOTIFY_EMAILS ?? 'will@harvey-capital.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const from = env.NOTIFY_FROM_EMAIL ?? 'Gal Gone Green <onboarding@resend.dev>';

  const jobberFailed = !!ctx.jobberError;
  const priceStr = s.isOutlier ? 'assessment needed' : `$${s.calculatedPrice}`;

  const subject = jobberFailed
    ? `[⚠️ MANUAL] New quote from ${s.name} — ${priceStr}`
    : `New quote: ${s.name} — ${priceStr} — ${friendlyService(s.serviceType)}`;

  const header = jobberFailed
    ? [
        '⚠️  JOBBER API FAILED — CREATE THIS CLIENT MANUALLY IN JOBBER.',
        `Error: ${ctx.jobberError}`,
        '',
      ]
    : [
        '✅ New instant quote submitted. Client created in Jobber with pinned note.',
        ctx.jobberClientId
          ? `Jobber client ID: ${ctx.jobberClientId}`
          : '',
        '',
      ];

  const text = [...header, formatDescription(s)].filter(Boolean).join('\n');
  const html = `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
