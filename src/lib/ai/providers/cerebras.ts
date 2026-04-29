import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

// Cerebras Cloud also exposes an OpenAI-compatible API.
const ENDPOINT = 'https://api.cerebras.ai/v1/chat/completions';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'cerebras';
  e.code = code;
  e.retryable = retryable;
  return e;
}

export const cerebrasProvider: ProviderClient = {
  id: 'cerebras',
  defaultModel: 'llama-3.3-70b',
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
          model: 'llama-3.3-70b',
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
    if (res.status === 429) throw err('rate-limit', 'cerebras rate limited');
    if (res.status === 401) throw err('auth', 'cerebras auth failed', false);
    if (res.status >= 500) throw err('server', `cerebras server ${res.status}`);
    if (!res.ok) throw err('bad-request', `cerebras ${res.status}`, false);

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw err('bad-request', 'cerebras empty response');
    return {
      content: text,
      provider: 'cerebras',
      model: 'llama-3.3-70b',
      estimatedTokens: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    };
  },
};
