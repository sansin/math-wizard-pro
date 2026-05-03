/**
 * Env loader — imported first by every script that needs .env.local.
 *
 * This file exists because of ES module hoisting: even if you put a
 * dotenv.config() call at the top of your script, it runs AFTER all
 * `import` statements have loaded their modules. Some of those modules
 * (notably src/lib/ai/router.ts) read process.env at module-load time,
 * so they capture stale (unset) values.
 *
 * The fix: extract the env-loading side effect into its own module, and
 * import it FIRST in your script. Static imports execute in declaration
 * order, so as long as `import './_load-env'` is the first import in the
 * script, the env file is loaded before anything else runs.
 *
 * Behavior:
 *   1. Loads .env.local first (same file Next.js / Vercel use).
 *   2. Then loads .env if present. dotenv doesn't overwrite already-set
 *      vars, so .env.local wins.
 *   3. Logs a one-line summary so the operator can see what got loaded.
 */

import { config as loadEnv } from 'dotenv';

const localResult = loadEnv({ path: '.env.local' });
loadEnv(); // .env if present, doesn't overwrite

if (localResult.error) {
  // Common: file not found. Not fatal — caller may still have shell env.
  const code = (localResult.error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') {
    console.warn('[env] .env.local not found in cwd — relying on shell env vars');
  } else {
    console.warn(`[env] could not read .env.local: ${localResult.error.message}`);
  }
} else if (localResult.parsed) {
  const keys = Object.keys(localResult.parsed);
  console.log(`[env] loaded ${keys.length} vars from .env.local`);

  // Show which provider keys were detected, with masked previews so the
  // operator can spot typos (e.g. "GROK_API_KEY" instead of "GROQ_API_KEY")
  // or empty values without leaking secrets.
  const PROVIDER_VARS = [
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'GROQ_API_KEY',
    'CEREBRAS_API_KEY',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'OPENROUTER_API_KEY',
    'MISTRAL_API_KEY',
    'HUGGINGFACE_API_KEY',
  ];
  const present: string[] = [];
  const empty: string[] = [];
  const missing: string[] = [];
  for (const v of PROVIDER_VARS) {
    const val = process.env[v];
    if (val === undefined) missing.push(v);
    else if (val === '') empty.push(v);
    else present.push(`${v}=${maskValue(val)}`);
  }
  if (present.length > 0) console.log(`[env] provider keys present:\n   - ${present.join('\n   - ')}`);
  if (empty.length > 0) console.warn(`[env] provider keys present but EMPTY: ${empty.join(', ')}`);
  if (missing.length > 0) console.log(`[env] provider keys missing: ${missing.join(', ')}`);
}

function maskValue(v: string): string {
  if (v.length <= 8) return '*'.repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-2)} (len ${v.length})`;
}
