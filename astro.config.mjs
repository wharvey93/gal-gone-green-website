// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://galgonegreen.com',
  output: 'static',
  image: {
    service: { entrypoint: 'astro/assets/services/noop' },
  },
  integrations: [
    preact(),
    sitemap({
      // Keep noindex pages out of the sitemap (SEO D1, 13 Nov 2026).
      filter: (page) =>
        !page.includes('/quote-preview') &&
        !page.includes('/thank-you'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
