// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
    sessions: false,
  }),
  trailingSlash: 'always',
  site: 'https://asmrregistry.com',
  // Stamps each build so a deploy retires edge-cached HTML (it points at CSS files the deploy deletes).
  vite: { define: { __BUILD_ID__: JSON.stringify(String(Date.now())) } },
});
