/**
 * AI Router — orchestrates multi-provider question generation.
 *
 * Resolution order:
 *   1. User-supplied keys (BYOK), in the user's preferred order.
 *   2. Admin-supplied keys, in the cost-optimized default order, IF
 *      shared keys are enabled for this user.
 *   3. Fail with ProviderError('no-provider-available').
 *
 * For each candidate:
 *   - Send the request with a per-call timeout.
 *   - On retryable error (rate-limit, server, timeout): try next provider.
 *   - On non-retryable error (auth, bad-request): mark provider as
 *     unhealthy for this request and try next.
 *   - On success: return the response and let caller verify content.
 */

import type { AIProviderId } from '@/types/core';
import type { MathPrompt, MathResponse, ProviderClient, RouterContext } from './types';
export type { RouterContext } from './types';
import { geminiProvider } from './providers/gemini';
import { claudeProvider } from './providers/claude';
import { openaiProvider } from './providers/openai';
import { groqProvider } from './providers/groq';
import { cerebrasProvider } from './providers/cerebras';
import { deepseekProvider } from './providers/deepseek';
import { cloudflareProvider } from './providers/cloudflare';
import { openrouterProvider } from './providers/openrouter';
import { mistralProvider } from './providers/mistral';
import { huggingfaceProvider } from './providers/huggingface';

const REGISTRY: Record<AIProviderId, ProviderClient> = {
  gemini: geminiProvider,
  claude: claudeProvider,
  openai: openaiProvider,
  groq: groqProvider,
  cerebras: cerebrasProvider,
  deepseek: deepseekProvider,
  cloudflare: cloudflareProvider,
  openrouter: openrouterProvider,
  mistral: mistralProvider,
  huggingface: huggingfaceProvider,
};

/**
 * Default order optimized for cost / free-tier usage.
 *  - All free-tier providers first (Gemini → Groq → Cerebras), so paid keys
 *    are touched only when free quotas are exhausted.
 *  - Then paid providers in quality/cost order: Claude (best math) → DeepSeek
 *    (cheap) → OpenAI (broad).
 *
 * Override via env var `AI_PROVIDER_ORDER` (comma-separated provider ids):
 *   AI_PROVIDER_ORDER=gemini,claude,openai
 * Providers not listed are appended in default order at the tail. This lets
 * users put their preferred free providers first while still benefiting
 * from automatic fallback to whatever's left if those are exhausted.
 */
const ALL_PROVIDERS: AIProviderId[] = [
  'gemini', 'groq', 'cerebras', 'cloudflare', 'openrouter', 'mistral', 'huggingface',
  'claude', 'deepseek', 'openai',
];
// Free-tier providers first (CF, Gemini, Groq, Cerebras, OpenRouter free
// models, Mistral, HF), paid last (Claude, DeepSeek, OpenAI).
const FREE_FIRST_ORDER: AIProviderId[] = [
  'cloudflare', 'gemini', 'groq', 'cerebras', 'openrouter', 'mistral', 'huggingface',
  'claude', 'deepseek', 'openai',
];

function parseEnvOrder(): AIProviderId[] | null {
  const raw = process.env.AI_PROVIDER_ORDER;
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AIProviderId => ALL_PROVIDERS.includes(s as AIProviderId));
  if (ids.length === 0) return null;
  // Append any providers not listed, so we never silently drop fallbacks.
  for (const p of ALL_PROVIDERS) {
    if (!ids.includes(p)) ids.push(p);
  }
  return ids;
}

const DEFAULT_ORDER: AIProviderId[] = parseEnvOrder() ?? FREE_FIRST_ORDER;

/** For tasks where reasoning quality matters most, Claude moves up — but
 * still respects user's env order if they set one. */
const QUALITY_ORDER: AIProviderId[] = parseEnvOrder() ?? [
  'claude', 'gemini', 'mistral', 'deepseek', 'openai',
  'openrouter', 'cloudflare', 'groq', 'cerebras', 'huggingface',
];

/**
 * Speed-first ordering used for the cold-cache "give the user a question
 * NOW" path. Instant-tier providers (Cerebras, Groq) come first so the
 * very first generation is as fast as possible. Quality-tier providers
 * fall later in the chain — fine for the 1-question fast path.
 */
const SPEED_FIRST_ORDER: AIProviderId[] = parseEnvOrder() ?? [
  'cerebras', 'groq', 'cloudflare', 'gemini',
  'openrouter', 'mistral', 'claude', 'huggingface', 'deepseek', 'openai',
];

export { SPEED_FIRST_ORDER };

export interface RouterOptions {
  /** Per-call timeout (ms). Defaults to 18s. */
  timeoutMs?: number;
  /** Override the default provider preference. */
  order?: AIProviderId[];
  /** Reject providers in this set (e.g., temporarily unhealthy). */
  excluded?: Set<AIProviderId>;
}

export interface RouterAttempt {
  provider: AIProviderId;
  source: 'user' | 'admin';
  ok: boolean;
  error?: string;
  latencyMs?: number;
}

export interface RouterResult {
  response: MathResponse;
  attempts: RouterAttempt[];
}

export class NoProviderError extends Error {
  attempts: RouterAttempt[];
  constructor(attempts: RouterAttempt[]) {
    super('No AI provider available');
    this.attempts = attempts;
    this.name = 'NoProviderError';
  }
}

/**
 * Build the ordered list of (provider, source) attempts to try, given the
 * user's keys, admin keys, and any preferences/exclusions.
 */
function buildAttemptOrder(
  ctx: RouterContext,
  opts: RouterOptions,
): Array<{ provider: AIProviderId; source: 'user' | 'admin'; key: string }> {
  const baseOrder = opts.order ?? ctx.preferredOrder ?? DEFAULT_ORDER;
  const excluded = opts.excluded ?? new Set();
  const out: Array<{ provider: AIProviderId; source: 'user' | 'admin'; key: string }> = [];

  // Pass 1: user keys first
  for (const provider of baseOrder) {
    if (excluded.has(provider)) continue;
    const key = ctx.userKeys[provider];
    if (key) out.push({ provider, source: 'user', key });
  }

  // Pass 2: admin keys (only if user is permitted)
  if (ctx.canUseSharedKeys) {
    for (const provider of baseOrder) {
      if (excluded.has(provider)) continue;
      // Skip if we already have this provider via user key.
      if (out.some((a) => a.provider === provider)) continue;
      const key = ctx.adminKeys[provider];
      if (key) out.push({ provider, source: 'admin', key });
    }
  }

  return out;
}

/** Try one provider once, with timeout enforcement. */
async function tryOne(
  provider: ProviderClient,
  prompt: MathPrompt,
  apiKey: string,
  timeoutMs: number,
): Promise<MathResponse> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await provider.complete(prompt, apiKey, ac.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function route(
  prompt: MathPrompt,
  ctx: RouterContext,
  opts: RouterOptions = {},
): Promise<RouterResult> {
  const order = opts.order ?? (
    prompt.task === 'generate-solution' || prompt.task === 'tutor-chat'
      ? QUALITY_ORDER
      : DEFAULT_ORDER
  );
  const candidates = buildAttemptOrder({ ...ctx, preferredOrder: order }, opts);
  const attempts: RouterAttempt[] = [];
  // 30s gives Gemini Flash room to generate 5 questions with full LaTeX
  // hints + solutions. The previous 18s ceiling was triggering false
  // timeouts on legitimately-long generations.
  const timeoutMs = opts.timeoutMs ?? 30_000;

  for (const cand of candidates) {
    const provider = REGISTRY[cand.provider];
    if (!provider) continue;
    const start = Date.now();
    try {
      const res = await tryOne(provider, prompt, cand.key, timeoutMs);
      attempts.push({
        provider: cand.provider,
        source: cand.source,
        ok: true,
        latencyMs: Date.now() - start,
      });
      return { response: res, attempts };
    } catch (e) {
      const err = e as { code?: string; message?: string; retryable?: boolean };
      attempts.push({
        provider: cand.provider,
        source: cand.source,
        ok: false,
        error: err.code ?? err.message ?? 'unknown',
        latencyMs: Date.now() - start,
      });
      // Non-retryable auth errors should not poison further providers, but we
      // do skip this one. Other errors continue down the list.
      continue;
    }
  }

  throw new NoProviderError(attempts);
}

export { REGISTRY as PROVIDER_REGISTRY };
