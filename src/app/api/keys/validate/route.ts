/**
 * POST /api/keys/validate
 *
 * Body: { provider: AIProviderId, key: string }  (key may be `accountId:token` for cloudflare)
 *
 * Returns: {
 *   ok: boolean,
 *   model?: string,
 *   latencyMs?: number,
 *   error?: string,
 * }
 *
 * Makes a minimal test request to the provider to verify the key works.
 * Used by the BYOK Settings UI to give users instant feedback.
 *
 * NOTE: this endpoint requires user auth so we don't become an open
 * key-validation oracle.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase/server';
import { PROVIDER_REGISTRY } from '@/lib/ai/router';
import type { MathPrompt } from '@/lib/ai/types';
import { saveValidation, bumpUsage } from '@/lib/ai/usage-tracker';

export const runtime = 'nodejs';

const Body = z.object({
  provider: z.enum([
    'gemini', 'claude', 'openai', 'deepseek', 'groq', 'cerebras',
    'cloudflare', 'openrouter', 'mistral', 'huggingface',
  ]),
  key: z.string().min(8).max(800),
});

const TEST_PROMPT: MathPrompt = {
  task: 'generate-question',
  system: 'You are a calculator. Reply with only a single number.',
  user: 'What is 2 plus 3? Reply with only the digit, nothing else.',
  temperature: 0,
  maxTokens: 16,
};

export async function POST(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'invalid-body', detail: (e as Error).message }, { status: 400 });
  }

  const provider = PROVIDER_REGISTRY[body.provider];
  if (!provider) {
    return NextResponse.json({ ok: false, error: 'unknown-provider' }, { status: 400 });
  }

  const start = Date.now();
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12_000);
    let response;
    try {
      response = await provider.complete(TEST_PROMPT, body.key, ac.signal);
    } finally {
      clearTimeout(timer);
    }
    // Persist the success + bump usage so it shows up in the UI even
    // after a refresh.
    await Promise.all([
      saveValidation(auth.user.id, body.provider, {
        ok: true,
        model: response.model,
        latencyMs: Date.now() - start,
      }),
      bumpUsage(auth.user.id, body.provider, 'validate', response.estimatedTokens),
    ]).catch(() => { /* non-fatal */ });
    // Defensive: if a provider returned content that isn't a string,
    // coerce to a short string so we never crash the validate response.
    const sampleText = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    return NextResponse.json({
      ok: true,
      model: response.model,
      latencyMs: Date.now() - start,
      sample: sampleText.slice(0, 60),
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const message = (err.message ?? 'Validation failed').slice(0, 300);
    await saveValidation(auth.user.id, body.provider, {
      ok: false,
      errorMessage: message,
      latencyMs: Date.now() - start,
    }).catch(() => { /* non-fatal */ });
    return NextResponse.json({
      ok: false,
      error: err.code ?? 'error',
      message,
      latencyMs: Date.now() - start,
    });
  }
}
