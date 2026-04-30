import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

/**
 * Cloudflare Workers AI provider.
 *
 * Two credentials are required: an account ID + an API token.
 *
 * For BYOK we accept them combined as `accountId:token` in a single
 * encrypted_key field, since the user_api_keys table is single-key per
 * provider. For admin-supplied keys, both come from env vars
 * (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN). Set up in key-resolver.ts
 * as a virtual key `accountId:token`.
 */

const MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'cloudflare';
  e.code = code;
  e.retryable = retryable;
  return e;
}

function parseKey(combined: string): { accountId: string; token: string } | null {
  const idx = combined.indexOf(':');
  if (idx <= 0 || idx === combined.length - 1) return null;
  return {
    accountId: combined.slice(0, idx).trim(),
    token: combined.slice(idx + 1).trim(),
  };
}

export const cloudflareProvider: ProviderClient = {
  id: 'cloudflare',
  defaultModel: MODEL,
  async complete(prompt, apiKey, signal) {
    const parsed = parseKey(apiKey);
    if (!parsed) {
      throw err('auth', 'cloudflare requires "accountId:token" format', false);
    }
    const url = `https://api.cloudflare.com/client/v4/accounts/${parsed.accountId}/ai/run/${MODEL}`;
    const body = {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_tokens: prompt.maxTokens ?? 1024,
      temperature: prompt.temperature ?? 0.7,
      stream: false,
    };

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${parsed.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw err('timeout', `network: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '<unreadable>');
      const trimmed = detail.length > 400 ? detail.slice(0, 400) + '...' : detail;
      console.error(`[cloudflare] ${res.status} model=${MODEL}: ${trimmed}`);
      if (res.status === 429) throw err('rate-limit', `cf 429: ${trimmed}`);
      if (res.status === 401 || res.status === 403) throw err('auth', `cf ${res.status}: ${trimmed}`, false);
      if (res.status >= 500) throw err('server', `cf ${res.status}: ${trimmed}`);
      throw err('bad-request', `cf ${res.status}: ${trimmed}`, false);
    }

    // Cloudflare's response shape varies by model. Observed shapes:
    //   { result: { response: "<text>", usage: {...} } }
    //   { result: { response: { role: "assistant", content: "<text>" } } }
    //   { result: { response: 5, ... } }                  ← number (when prompt elicits one)
    //   { result: { choices: [{ message: { content: "<text>" } }] } }
    // We defensively extract a plain string from any of these.
    const data = (await res.json()) as {
      result?: {
        response?: string | number | boolean | { role?: string; content?: string };
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      };
      success?: boolean;
      errors?: unknown[];
    };

    let text = '';
    const r = data.result?.response;
    if (typeof r === 'string') {
      text = r;
    } else if (typeof r === 'number' || typeof r === 'boolean') {
      // CF can return a JSON-typed primitive when the model output is a
      // single digit / true / false. Coerce to string so downstream
      // consumers (.slice etc) work.
      text = String(r);
    } else if (r && typeof r === 'object' && typeof r.content === 'string') {
      text = r.content;
    } else if (data.result?.choices?.[0]?.message?.content) {
      text = data.result.choices[0].message.content;
    }
    if (!text) {
      console.error('[cloudflare] empty/unrecognized response shape:', JSON.stringify(data).slice(0, 400));
      throw err('bad-request', 'cloudflare empty response (unknown shape)');
    }

    return {
      content: text,
      provider: 'cloudflare',
      model: MODEL,
      estimatedTokens: data.result?.usage?.total_tokens ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    } satisfies MathResponse;
  },
};
