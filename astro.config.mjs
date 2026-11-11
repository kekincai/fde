import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

import { SITE_URL } from './src/data/site.ts';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  site: SITE_URL,
  vite: {
    // `astro dev` has no Worker; read the live API so the paper can be laid out against real data.
    server: { proxy: { '/api': { target: process.env.FDE_API ?? SITE_URL, changeOrigin: true } } },
    ssr: {
      noExternal: ['@astrojs/react']
    }
  }
});
