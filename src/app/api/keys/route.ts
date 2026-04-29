/**
 * BYOK key management.
 *
 * GET    /api/keys   — list user's keys (hint+metadata only).
 * POST   /api/keys   — add or replace a key. Body: { provider, key }.
 * DELETE /api/keys?provider=xxx — remove a key.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { encryptKey, makeHint } from '@/lib/ai/encryption';
import { PROVIDER_LIST } from '@/lib/ai/provider-info';

export const runtime = 'nodejs';

const PostBody = z.object({
  provider: z.enum(['gemini', 'claude', 'openai', 'deepseek', 'groq', 'cerebras']),
  key: z.string().min(8).max(400),
});

export async function GET() {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const sb = getServiceClient();
  const { data } = await sb
    .from('user_api_keys')
    .select('provider, hint, active, added_at')
    .eq('user_id', auth.user.id);

  return NextResponse.json({
    keys: data ?? [],
    providers: PROVIDER_LIST,
  });
}

export async function POST(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid-body', detail: (e as Error).message }, { status: 400 });
  }

  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'server-not-configured' }, { status: 500 });
  }

  const encrypted = await encryptKey(body.key, secret);
  const hint = makeHint(body.key);

  const sb = getServiceClient();
  const { error } = await sb.from('user_api_keys').upsert(
    {
      user_id: auth.user.id,
      provider: body.provider,
      encrypted_key: encrypted,
      hint,
      active: true,
    },
    { onConflict: 'user_id,provider' },
  );
  if (error) {
    return NextResponse.json({ error: 'persist-failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, provider: body.provider, hint });
}

export async function DELETE(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');
  if (!provider || !PROVIDER_LIST.includes(provider as 'gemini')) {
    return NextResponse.json({ error: 'invalid-provider' }, { status: 400 });
  }
  const sb = getServiceClient();
  await sb.from('user_api_keys').delete().eq('user_id', auth.user.id).eq('provider', provider);
  return NextResponse.json({ ok: true });
}
