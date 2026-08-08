import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  site: 'https://fde-radar.example.com',
  vite: {
    ssr: {
      noExternal: ['@astrojs/react']
    }
  }
});
