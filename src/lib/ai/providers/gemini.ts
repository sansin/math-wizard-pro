import type { MathPrompt, MathResponse, ProviderClient, ProviderError } from '../types';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Default model is the most generous on the free tier (15 RPM, 1500 RPD).
// gemini-2.5-flash has much tighter free-tier limits (10 RPM, 250 RPD) and
// often gates to paid-only — set GEMINI_MODEL=gemini-2.5-flash if you have
// billing enabled and want the newer model.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function err(code: ProviderError['code'], message: string, retryable = true): ProviderError {
  const e = new Error(message) as ProviderError;
  e.provider = 'gemini';
  e.code = code;
  e.retryable = retryable;
  return e;
}

async function readBody(res: Response): Promise<string> {
  try { return await res.text(); } catch { return '<unreadable>'; }
}

export const geminiProvider: ProviderClient = {
  id: 'gemini',
  defaultModel: MODEL,
  async complete(prompt, apiKey, signal) {
    const model = MODEL;
    const url = `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    // We deliberately do NOT pass `responseSchema` to Gemini even when a
    // jsonSchema is provided. Gemini's structured-output mode silently
    // produces empty `{}` objects for discriminated-union fields it can't
    // express, which then breaks downstream parsing. Instead we ask for
    // application/json mime-type and rely on the system prompt to enforce
    // the shape. Our Zod schema validates the result.
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: {
        temperature: prompt.temperature ?? 0.7,
        maxOutputTokens: prompt.maxTokens ?? 1024,
        responseMimeType: prompt.jsonSchema ? 'application/json' : 'text/plain',
      },
    };

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

    // Surface Google's actual error message for any non-2xx response — without
    // it the router silently flips through providers and you can't see why.
    if (!res.ok) {
      const detail = await readBody(res);
      // Truncate to avoid filling logs.
      const trimmed = detail.length > 400 ? detail.slice(0, 400) + '...' : detail;
      console.error(`[gemini] ${res.status} model=${model}: ${trimmed}`);
      if (res.status === 429) throw err('rate-limit', `gemini 429: ${trimmed}`);
      if (res.status === 401 || res.status === 403) throw err('auth', `gemini ${res.status}: ${trimmed}`, false);
      if (res.status >= 500) throw err('server', `gemini ${res.status}: ${trimmed}`);
      throw err('bad-request', `gemini ${res.status}: ${trimmed}`, false);
    }

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
