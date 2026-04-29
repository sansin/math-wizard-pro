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

const REGISTRY: Record<AIProviderId, ProviderClient> = {
  gemini: geminiProvider,
  claude: claudeProvider,
  openai: openaiProvider,
  groq: groqProvider,
  cerebras: cerebrasProvider,
  deepseek: deepseekProvider,
};

/**
 * Default order optimized for cost / free-tier usage.
 *  - Gemini first (largest free tier, strong quality)
 *  - Claude second for tasks needing reasoning quality (overridden per-task)
 *  - Groq + Cerebras for speed + free tier
 *  - DeepSeek + OpenAI as paid fallbacks
 */
const DEFAULT_ORDER: AIProviderId[] = ['gemini', 'groq', 'cerebras', 'claude', 'deepseek', 'openai'];

/** For tasks where reasoning quality matters most, Claude moves up. */
const QUALITY_ORDER: AIProviderId[] = ['claude', 'gemini', 'deepseek', 'openai', 'groq', 'cerebras'];

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
  const timeoutMs = opts.timeoutMs ?? 18_000;

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
