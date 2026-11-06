import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  site: 'https://fde-radar.example.com',
  vite: {
    // `astro dev` has no Worker; read the live API so the paper can be laid out against real data.
    server: { proxy: { '/api': { target: process.env.FDE_API ?? 'https://fde.kejincai.dev', changeOrigin: true } } },
    ssr: {
      noExternal: ['@astrojs/react']
    }
  }
});
