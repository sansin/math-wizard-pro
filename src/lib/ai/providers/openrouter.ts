import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

/**
 * OpenRouter — one API for hundreds of models, several with free tiers.
 *
 * Strategy: maintain a curated list of known-free models in priority order
 * (best math reasoning first, smallest fallback last). On each request we
 * try the first non-cooled-down model. If we get a rate-limit (429), we
 * mark that model as cooled-down for COOLDOWN_MS and try the next. Only
 * after exhausting the entire list do we propagate the 429 up to the
 * router, which can then fall through to a different provider entirely.
 *
 * Configuration:
 *   - OPENROUTER_MODEL: when set, we use ONLY that model and skip the
 *     cycling logic. Useful if you want to pin a specific paid model.
 *   - OPENROUTER_FREE_MODELS: comma-separated override of the curated
 *     free-models list (advanced — most users won't need this).
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Curated free models (ordered by quality & math suitability).
 *
 * IMPORTANT: OpenRouter regularly rotates which providers serve which
 * models. A model may return 404 "No endpoints found" for days then come
 * back. Our code treats 404 as a rotatable cooldown error (1 hour),
 * so a temporary outage of one model just shifts traffic to the next.
 *
 * Browse the live list at https://openrouter.ai/models?max_price=0 and
 * override with `OPENROUTER_FREE_MODELS=...` env var if needed.
 */
const DEFAULT_FREE_MODELS = [
  // Top-tier reasoning (best for math)
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'qwen/qwen3-235b-a22b:free',
  'qwen/qwen3-coder:free',
  // Solid 70B-class generalists
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-4-scout:free',
  // Mid-size frontier (often available when 70B+ are saturated)
  'google/gemini-2.0-flash-exp:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
  'mistralai/mistral-nemo:free',
  // Smaller fallbacks (almost always have endpoints)
  'meta-llama/llama-3.2-3b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
];

const MODELS_FROM_ENV = process.env.OPENROUTER_FREE_MODELS
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const PINNED_MODEL = process.env.OPENROUTER_MODEL;

const FREE_MODELS = PINNED_MODEL
  ? [PINNED_MODEL]
  : (MODELS_FROM_ENV && MODELS_FROM_ENV.length > 0 ? MODELS_FROM_ENV : DEFAULT_FREE_MODELS);

/** How long to wait before retrying a model that returned 429. */
const COOLDOWN_MS = 60 * 60_000; // 1 hour

/**
 * Per-process cooldown tracking. Map of `apiKey:model` → unix-ms when
 * the cooldown expires. Keying by the API key keeps cooldown state
 * separate per user (BYOK) when the same Node process serves multiple
 * users — important so one user's exhausted Llama doesn't block another.
 */
const exhaustedUntil = new Map<string, number>();

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'openrouter';
  e.code = code;
  e.retryable = retryable;
  return e;
}

async function tryOneModel(
  prompt: MathPrompt,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<MathResponse> {
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://math-wizard-pro.pages.dev',
        'X-Title': 'Math Wizard Pro',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: prompt.temperature ?? 0.7,
        max_tokens: prompt.maxTokens ?? 1024,
        ...(prompt.jsonSchema ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    });
  } catch (e) {
    throw err('timeout', `network: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '<unreadable>');
    const trimmed = detail.length > 400 ? detail.slice(0, 400) + '...' : detail;
    console.error(`[openrouter] ${res.status} model=${model}: ${trimmed}`);

    if (res.status === 429) {
      // OpenRouter's free tier has an ACCOUNT-WIDE rate limit, not per-model:
      // ~50 requests/day total across all `:free` models on a basic free
      // account, ~1000/day with a $10 lifetime top-up. When the account
      // quota is hit, every model returns 429 — no point cycling.
      // Detect the account-level signal so the router can move on to a
      // different provider entirely.
      const isAccountWide = /free-models-per-day|account.level|rate.limit/i.test(detail);
      const e = err(
        'rate-limit',
        isAccountWide
          ? `or 429 account-quota (${model}): ${trimmed}`
          : `or 429 (${model}): ${trimmed}`,
      );
      // Tag the error so the cycle loop in `complete()` can short-circuit.
      (e as ProviderError & { accountWide?: boolean }).accountWide = isAccountWide;
      throw e;
    }
    if (res.status === 401 || res.status === 403) throw err('auth', `or ${res.status}: ${trimmed}`, false);
    if (res.status >= 500) throw err('server', `or ${res.status}: ${trimmed}`);
    // OpenRouter returns 404 + "No endpoints found" for models that have
    // no live providers right now (the model still exists but is offline).
    // We map this to rate-limit so the rotation logic moves on instead of
    // hard-failing the whole provider.
    if (res.status === 404 && /no endpoints/i.test(detail)) {
      throw err('rate-limit', `or 404 no-endpoints (${model})`);
    }
    throw err('bad-request', `or ${res.status} (${model}): ${trimmed}`, false);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw err('bad-request', `or empty response (${model})`);

  return {
    content: text,
    provider: 'openrouter',
    model,
    estimatedTokens: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
    latencyMs: Date.now() - start,
  };
}

export const openrouterProvider: ProviderClient = {
  id: 'openrouter',
  defaultModel: FREE_MODELS[0]!,
  async complete(prompt, apiKey, signal) {
    const triedFailures: string[] = [];

    for (const model of FREE_MODELS) {
      // Skip models we've recently 429'd on (per-key, per-model).
      const cooldownKey = `${apiKey.slice(-8)}:${model}`;
      const until = exhaustedUntil.get(cooldownKey);
      if (until && until > Date.now()) {
        triedFailures.push(`${model}=cooldown`);
        continue;
      }

      try {
        const res = await tryOneModel(prompt, apiKey, model, signal);
        // Success — clear any cooldown for this model (in case rate-limit lifted early).
        exhaustedUntil.delete(cooldownKey);
        return res;
      } catch (e) {
        const provErr = e as ProviderError & { accountWide?: boolean };
        // Auth / bad-request: a fundamental problem (bad key, content too long).
        // Don't churn through more models — propagate immediately.
        if (provErr.code === 'auth' || provErr.code === 'bad-request') {
          throw provErr;
        }
        // Account-wide rate-limit: cycling is pointless — every model
        // hits the same quota. Throw immediately so the router moves
        // on to a different provider.
        if (provErr.accountWide) {
          throw err(
            'rate-limit',
            'OpenRouter account daily quota reached. Top up $10 (lifetime) to unlock 1000 req/day, or wait for daily reset.',
          );
        }
        // Per-model rate-limit / server / timeout: cool down THIS model and try next.
        if (provErr.code === 'rate-limit') {
          exhaustedUntil.set(cooldownKey, Date.now() + COOLDOWN_MS);
        }
        triedFailures.push(`${model}=${provErr.code ?? 'err'}`);
        continue;
      }
    }

    // Every free model is rate-limited or erroring. Surface as rate-limit
    // so the router moves on to the next provider.
    throw err(
      'rate-limit',
      `All OpenRouter free models exhausted: ${triedFailures.join(', ')}`,
    );
  },
};
