import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'openai';
  e.code = code;
  e.retryable = retryable;
  return e;
}

export const openaiProvider: ProviderClient = {
  id: 'openai',
  defaultModel: 'gpt-4o-mini',
  async complete(prompt, apiKey, signal) {
    const start = Date.now();
    const model = prompt.task === 'tutor-chat' ? 'gpt-4o-mini' : 'gpt-4o-mini';
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
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

    if (!res.ok) {
      const detail = await res.text().catch(() => '<unreadable>');
      const trimmed = detail.length > 400 ? detail.slice(0, 400) + '...' : detail;
      console.error(`[openai] ${res.status}: ${trimmed}`);
      if (res.status === 429) throw err('rate-limit', `openai 429: ${trimmed}`);
      if (res.status === 401 || res.status === 403) throw err('auth', `openai ${res.status}: ${trimmed}`, false);
      if (res.status >= 500) throw err('server', `openai ${res.status}: ${trimmed}`);
      throw err('bad-request', `openai ${res.status}: ${trimmed}`, false);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw err('bad-request', 'openai empty response');

    return {
      content: text,
      provider: 'openai',
      model,
      estimatedTokens: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    };
  },
};
