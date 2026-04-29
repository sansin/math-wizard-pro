import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'gemini';
  e.code = code;
  e.retryable = retryable;
  return e;
}

export const geminiProvider: ProviderClient = {
  id: 'gemini',
  defaultModel: 'gemini-2.0-flash',
  async complete(prompt, apiKey, signal) {
    const model = prompt.task === 'tutor-chat' ? 'gemini-2.0-flash' : 'gemini-2.0-flash';
    const url = `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: {
        temperature: prompt.temperature ?? 0.7,
        maxOutputTokens: prompt.maxTokens ?? 1024,
        responseMimeType: prompt.jsonSchema ? 'application/json' : 'text/plain',
      },
    };
    if (prompt.jsonSchema) {
      (body.generationConfig as Record<string, unknown>).responseSchema = prompt.jsonSchema;
    }

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw err('timeout', `network: ${(e as Error).message}`);
    }

    if (res.status === 429) throw err('rate-limit', 'gemini rate limited');
    if (res.status === 401 || res.status === 403) throw err('auth', `gemini auth: ${res.status}`, false);
    if (res.status >= 500) throw err('server', `gemini server: ${res.status}`);
    if (!res.ok) throw err('bad-request', `gemini: ${res.status}`, false);

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw err('bad-request', 'gemini empty response');

    return {
      content: text,
      provider: 'gemini',
      model,
      estimatedTokens: data.usageMetadata?.totalTokenCount ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - start,
    } satisfies MathResponse;
  },
};
