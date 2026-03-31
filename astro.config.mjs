// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://galgonegreen.com',
  output: 'static',

  image: {
    // Use passthrough service — images are pre-optimized at build time
    service: { entrypoint: 'astro/assets/services/noop' },
  },

  integrations: [sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: cloudflare(),
});