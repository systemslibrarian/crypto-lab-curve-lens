import { defineConfig } from 'vite';

export default defineConfig({
  base: '/crypto-lab-curve-lens/',
  server: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: 'dist',
  },
});
