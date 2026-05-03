import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

/**
 * Hugging Face Inference Providers (router) — proxies to many providers
 * (Together, Sambanova, Cerebras, etc.) under one API. Free tier with
 * monthly credit limits.
 *
 * Endpoint: https://router.huggingface.co/v1/chat/completions
 * (the legacy https://api-inference.huggingface.co endpoint also works
 * but is being deprecated in favor of the router).
 *
 * OpenAI-compatible at the chat-completions API level.
 */

const ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const MODEL = process.env.HF_MODEL || 'meta-llama/Llama-3.3-70B-Instruct';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'huggingface';
  e.code = code;
  e.retryable = retryable;
  return e;
}

export const huggingfaceProvider: ProviderClient = {
  id: 'huggingface',
  defaultModel: MODEL,
  async complete(prompt, apiKey, signal) {
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: prompt.temperature ?? 0.7,
          max_tokens: prompt.maxTokens ?? 1024,
        }),
        signal,
      });
    } catch (e) {
      throw err('timeout', `network: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '<unreadable>');
      const trimmed = detail.length > 400 ? detail.slice(0, 400) + '...' : detail;
      if (res.status === 429 || res.status === 503) throw err('rate-limit', `hf ${res.status}: ${trimmed}`);
      console.error(`[huggingface] ${res.status} model=${MODEL}: ${trimmed}`);
      if (res.status === 401 || res.status === 403) throw err('auth', `hf ${res.status}: ${trimmed}`, false);
      if (res.status >= 500) throw err('server', `hf ${res.status}: ${trimmed}`);
      throw err('bad-request', `hf ${res.status}: ${trimmed}`, false);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw err('bad-request', 'huggingface empty response');

    return {
      content: text,
      provider: 'huggingface',
      model: MODEL,
      estimatedTokens: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    } satisfies MathResponse;
  },
};
