import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/crypto-lab-curve-lens/',
  // 4621 is this lab's own port. 4173 is vite's default and was until today
  // claimed by a dozen labs at once — a preview left running on it gets
  // silently reused by a sibling's harness, which then audits the wrong app
  // and reports green.
  server: {
    host: '0.0.0.0',
    port: 4621,
  },
  preview: {
    port: 4621,
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
