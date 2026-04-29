import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

// DeepSeek exposes an OpenAI-compatible API.
const ENDPOINT = 'https://api.deepseek.com/chat/completions';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'deepseek';
  e.code = code;
  e.retryable = retryable;
  return e;
}

export const deepseekProvider: ProviderClient = {
  id: 'deepseek',
  defaultModel: 'deepseek-chat',
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
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: prompt.temperature ?? 0.7,
          max_tokens: prompt.maxTokens ?? 1024,
          ...(prompt.jsonSchema
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        signal,
      });
    } catch (e) {
      throw err('timeout', `network: ${(e as Error).message}`);
    }
    if (res.status === 429) throw err('rate-limit', 'deepseek rate limited');
    if (res.status === 401) throw err('auth', 'deepseek auth failed', false);
    if (res.status >= 500) throw err('server', `deepseek server ${res.status}`);
    if (!res.ok) throw err('bad-request', `deepseek ${res.status}`, false);

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw err('bad-request', 'deepseek empty response');
    return {
      content: text,
      provider: 'deepseek',
      model: 'deepseek-chat',
      estimatedTokens: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    };
  },
};
