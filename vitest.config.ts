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

        // ── Next.js framework files (no logic to cover) ───────────────
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',

        // ── Page components & API routes — covered by Playwright E2E ──
        // Pages are thin compositions of components; the components and
        // libraries they use ARE unit-tested. Exhaustive page-level
        // coverage runs in `npm run test:e2e`.
        'src/app/**/page.tsx',
        'src/app/**/PracticeClient.tsx',
        'src/app/api/**',

        // ── Network-IO heavy files — exercised by integration/E2E ─────
        'src/lib/ai/providers/**',
        'src/lib/ai/key-resolver.ts',
        'src/lib/ai/usage-tracker.ts',
        'src/lib/ai/generator.ts',
        'src/lib/ai/prompts.ts',
        'src/lib/ai/provider-info.ts',
        'src/lib/firebase/**',
        'src/lib/supabase/**',

        // ── Untested UI components (covered by Playwright E2E) ────────
        // These are large React components dominated by JSX. Their
        // testable logic has been factored into hooks/libs that ARE
        // unit-tested. Add to this list when introducing a new component
        // that's E2E-tested but not unit-tested, or remove from the list
        // when adding a unit test for one.
        'src/components/Wizard.tsx',
        'src/components/dashboard/**',
        'src/components/layout/**',
        'src/components/parent/**',
        'src/components/practice/ModuleSelector.tsx',
        'src/components/practice/PracticeScreen.tsx',
        'src/components/practice/ProviderBadge.tsx',
        'src/components/practice/ReportButton.tsx',
        'src/components/practice/EndSummary.tsx',
        'src/components/practice/SolutionPanel.tsx',
        'src/components/settings/**',
        'src/components/ui/Card.tsx',
        'src/components/ui/Input.tsx',
        'src/components/ui/Modal.tsx',
      ],
      // Coverage gates apply to the IN-SCOPE files only — the core math,
      // mastery, and shared utility libs plus the four unit-tested
      // components (Button, AnswerInput, MathRender, HintLadder).
      // These have substantive logic and we hold them to a high bar.
      thresholds: {
        autoUpdate: false,
        lines: 80,
        functions: 90,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
