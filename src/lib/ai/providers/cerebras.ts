import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

// Cerebras Cloud — OpenAI-compatible chat-completions API.
const ENDPOINT = 'https://api.cerebras.ai/v1/chat/completions';

// Default to llama-3.1-8b: it's the reliably-free model on Cerebras Cloud's
// free tier. The bigger llama-3.3-70b and llama-4 models are gated to paid
// or approved accounts. Override with CEREBRAS_MODEL if you have access.
//
// Available models (paid-tier needed for the larger ones):
//   - llama-3.1-8b               (free tier reliable)
//   - llama-3.3-70b              (often paid)
//   - llama-4-scout-17b-16e-instruct
//   - qwen-3-32b
//   - gpt-oss-120b
const MODEL = process.env.CEREBRAS_MODEL || 'llama-3.1-8b';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'cerebras';
  e.code = code;
  e.retryable = retryable;
  return e;
}

export const cerebrasProvider: ProviderClient = {
  id: 'cerebras',
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
      if (res.status === 429) throw err('rate-limit', `cerebras 429: ${trimmed}`);
      console.error(`[cerebras] ${res.status} model=${MODEL}: ${trimmed}`);
      if (res.status === 401 || res.status === 403) throw err('auth', `cerebras ${res.status}: ${trimmed}`, false);
      if (res.status >= 500) throw err('server', `cerebras ${res.status}: ${trimmed}`);
      throw err('bad-request', `cerebras ${res.status}: ${trimmed}`, false);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw err('bad-request', 'cerebras empty response');
    return {
      content: text,
      provider: 'cerebras',
      model: MODEL,
      estimatedTokens: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    } satisfies MathResponse;
  },
};
