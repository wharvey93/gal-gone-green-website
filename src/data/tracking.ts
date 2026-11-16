// Ad tracking IDs for galgonegreen.com.
//
// META PIXEL SLOT (L-24, CEO approved 16 Nov 2026; spec: Lena's Meta audit section 9b,
// EA repo projects/gal-gone-green/marketing/ads/2026-11-16-meta-ads-deep-audit.md).
// Empty on purpose. Nothing loads from it yet: no Meta pixel or Conversions API code exists on this branch.
//
// To switch the pixel on (one commit, desk + Greta, after the CEO creates the dataset in Events Manager):
//   1. Paste the Dataset ID (a number, not a secret) below.
//   2. Add the pixel base code in src/layouts/BaseLayout.astro at the marked slot, rendered only when this ID is set,
//      with the four events in the spec (PageView, ViewContent, Lead with an event_id; no advanced matching).
//   3. Add the server-side Lead call in functions/api/submit-quote.ts with the same event_id.
//      The Conversions API token lives ONLY in the Cloudflare Worker secret META_CAPI_TOKEN
//      (`npx wrangler secret put META_CAPI_TOKEN`), never in this file, a commit or a chat.
//   4. src/pages/privacy.astro already names the Meta pixel and Conversions API (privacy v2). Keep it in step.
export const META_PIXEL_ID = '';
