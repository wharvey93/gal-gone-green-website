// Guards for the 16 Nov 2026 CEO rulings: privacy v2 (SMS section, Meta pixel named before it fires, L-24),
// the 48-hour fix promise everywhere, and the empty Meta pixel slot.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { META_PIXEL_ID } from '../src/data/tracking';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('privacy policy v2', () => {
  const privacy = read('src/pages/privacy.astro');

  it('carries the SMS section the /quote consent line points to', () => {
    expect(privacy).toContain('id="text-messages"');
    expect(privacy).toContain('Reply STOP');
    expect(privacy).toContain('Consent is not a condition of purchase');
  });

  it('names the Meta pixel and never says the site runs none', () => {
    expect(privacy).toContain('Meta pixel and Conversions API');
    expect(privacy).toContain('facebook.com/adsettings');
    expect(privacy).not.toMatch(/do not (run|use) the Meta/i);
    expect(privacy).not.toContain('does not use cookies for tracking');
  });

  it('has no unresolved [CONFIRM] markers', () => {
    expect(privacy).not.toContain('[CONFIRM');
  });

  it('the quote form consent line links to the privacy page', () => {
    expect(read('src/components/QuoteCalculator.tsx')).toContain('href="/privacy"');
  });
});

describe('fix promise is 48 hours everywhere (CEO 16 Nov 2026)', () => {
  for (const page of ['src/pages/index.astro', 'src/pages/about.astro', 'src/pages/terms.astro']) {
    it(`${page} promises the 48-hour return and no 24-hour re-clean`, () => {
      const src = read(page);
      expect(src).toContain('within 48 hours');
      expect(src).not.toMatch(/re-clean within 24 hours/i);
      expect(src).not.toMatch(/contact us within 24 hours and we('ll| will) (come back|arrange)/i);
    });
  }
});

describe('Meta pixel slot', () => {
  it('is empty until the Dataset ID arrives, or holds digits only', () => {
    expect(META_PIXEL_ID === '' || /^\d{10,20}$/.test(META_PIXEL_ID)).toBe(true);
  });

  it('no Meta code ships while the slot is empty', () => {
    if (META_PIXEL_ID !== '') return;
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toContain('META PIXEL SLOT');
    expect(layout).not.toContain('connect.facebook.net');
    expect(layout).not.toMatch(/fbq\(/);
  });

  it('the Conversions API token never sits in source', () => {
    expect(read('src/data/tracking.ts')).not.toMatch(/EAA[A-Za-z0-9]{20,}/);
    expect(read('wrangler.jsonc')).not.toContain('META_CAPI_TOKEN');
  });
});
