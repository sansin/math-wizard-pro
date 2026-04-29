/**
 * POST /api/sessions   — start a new session.
 * PATCH /api/sessions  — end / update an existing session.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const StartBody = z.object({
  mode: z.enum(['practice', 'test', 'review', 'challenge']),
  gradeBand: z.enum(['K-1', '2-3', '4-5', '6-7', '8-9', '10-12']),
  skillIds: z.array(z.string()).min(1).max(40),
});

const EndBody = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: z.infer<typeof StartBody>;
  try { body = StartBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'invalid', detail: (e as Error).message }, { status: 400 }); }

  const sb = getServiceClient();
  const { data, error } = await sb.from('sessions').insert({
    user_id: auth.user.id,
    mode: body.mode,
    grade_band: body.gradeBand,
    skill_ids: body.skillIds,
  }).select('id, started_at').single();

  if (error) return NextResponse.json({ error: 'persist', detail: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function PATCH(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: z.infer<typeof EndBody>;
  try { body = EndBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'invalid', detail: (e as Error).message }, { status: 400 }); }

  const sb = getServiceClient();
  await sb.from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', body.sessionId)
    .eq('user_id', auth.user.id);

  return NextResponse.json({ ok: true });
}
