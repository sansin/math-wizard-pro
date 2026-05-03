import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/types/**',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
        // Network-IO heavy files are exercised in integration / live-deploy
        // tests, not unit tests. Excluding from coverage signal.
        'src/app/api/**',
        'src/lib/ai/providers/**',
        'src/lib/ai/key-resolver.ts',
        'src/lib/ai/usage-tracker.ts',
        'src/lib/ai/generator.ts',
        'src/lib/ai/prompts.ts',
        'src/lib/ai/provider-info.ts',
        'src/lib/firebase/**',
        'src/lib/supabase/**',
      ],
      // Only the core math + mastery libs are gated by coverage thresholds.
      // The tested modules already exceed these comfortably; broader
      // coverage of network-IO code lives in e2e + production smoke.
      thresholds: {
        autoUpdate: false,
        lines: 60,
        functions: 70,
        branches: 65,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
