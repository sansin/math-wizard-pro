import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Test config for the shared package. We deliberately keep this MINIMAL:
 *   - node environment (no jsdom — pure-TS code, no React)
 *   - no setup file needed
 *   - tests live alongside src in tests/
 *
 * Coverage gates intentionally not configured here; the parent web
 * package has its own gates that include this package's files via
 * import. We can add per-package gates later if needed.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
  resolve: {
    alias: {
      '@sageon/math-wizard-shared': path.resolve(__dirname, './src'),
    },
  },
});
