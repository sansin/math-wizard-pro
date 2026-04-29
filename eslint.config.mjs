import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: [
      'tests/e2e/**',
      'supabase/**',
      '.next/**',
      'out/**',
      'node_modules/**',
      'coverage/**',
    ],
  },
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
