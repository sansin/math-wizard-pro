import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'claude';
  e.code = code;
  e.retryable = retryable;
  return e;
}

export const claudeProvider: ProviderClient = {
  id: 'claude',
  defaultModel: 'claude-haiku-4-5-20251001',
  async complete(prompt, apiKey, signal) {
    // Claude doesn't have a native JSON schema flag; we instruct in system.
    const sys = prompt.jsonSchema
      ? `${prompt.system}\n\nReturn ONLY a JSON object matching this schema:\n${JSON.stringify(prompt.jsonSchema)}`
      : prompt.system;

    // Tutor + heavy reasoning use Sonnet; everything else uses Haiku.
    const model =
      prompt.task === 'tutor-chat' || prompt.task === 'generate-solution'
        ? 'claude-sonnet-4-6'
        : 'claude-haiku-4-5-20251001';

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          system: sys,
          messages: [{ role: 'user', content: prompt.user }],
          max_tokens: prompt.maxTokens ?? 1024,
          temperature: prompt.temperature ?? 0.7,
        }),
        signal,
      });
    } catch (e) {
      throw err('timeout', `network: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '<unreadable>');
      const trimmed = detail.length > 400 ? detail.slice(0, 400) + '...' : detail;
      console.error(`[claude] ${res.status} model=${model}: ${trimmed}`);
      if (res.status === 429) throw err('rate-limit', `claude 429: ${trimmed}`);
      if (res.status === 401 || res.status === 403) throw err('auth', `claude ${res.status}: ${trimmed}`, false);
      if (res.status >= 500) throw err('server', `claude ${res.status}: ${trimmed}`);
      throw err('bad-request', `claude ${res.status}: ${trimmed}`, false);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text =
      data.content?.find((b) => b.type === 'text')?.text ?? '';
    if (!text) throw err('bad-request', 'claude empty response');

    return {
      content: text,
      provider: 'claude',
      model,
      estimatedTokens:
        (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) ||
        Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    };
  },
};
