import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/crypto-lab-curve-lens/',
  server: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: 'dist',
  },
  // Scope vitest to unit tests; e2e/*.spec.ts belongs to Playwright, which
  // would otherwise be swept up by vitest's default include glob.
  test: {
    include: ['src/**/*.test.ts'],
  },
});
