// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://galgonegreen.com',
  output: 'static',

  image: {
    // Pre-optimize all images at build time (no server needed)
    service: { entrypoint: 'astro/assets/services/sharp' },
  },

  integrations: [sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: cloudflare(),
});