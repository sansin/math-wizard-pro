/**
 * POST /api/questions/report
 *
 * Lets a user flag a question as bad (wrong answer, confusing, etc.).
 * Increments the question's `flagged_count` so the cache lookup demotes
 * or excludes it. Also records a row in `question_feedback` for admin
 * review.
 *
 * Body: { questionId, reason, comment? }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Body = z.object({
  questionId: z.string().uuid(),
  // Keep this enum in sync with the REASONS list rendered by
  // ReportButton.tsx — both are user-facing controls.
  reason: z.enum([
    'wrong-answer',
    'confusing',
    'too-hard',
    'too-easy',
    'duplicate',
    'other',
  ]),
  comment: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid', detail: (e as Error).message }, { status: 400 });
  }

  const sb = getServiceClient();

  // Insert feedback row.
  const { error: fbErr } = await sb.from('question_feedback').insert({
    user_id: auth.user.id,
    question_id: body.questionId,
    reason: body.reason,
    comment: body.comment ?? null,
  });
  if (fbErr) {
    return NextResponse.json({ error: 'persist-failed', detail: fbErr.message }, { status: 500 });
  }

  // Bump flagged_count on the question. Use a read+write since Supabase
  // doesn't expose atomic increment in the JS client.
  const { data: q } = await sb
    .from('questions')
    .select('flagged_count')
    .eq('id', body.questionId)
    .maybeSingle();
  const current = (q as { flagged_count?: number } | null)?.flagged_count ?? 0;
  await sb
    .from('questions')
    .update({ flagged_count: current + 1 })
    .eq('id', body.questionId);

  return NextResponse.json({ ok: true, newFlagCount: current + 1 });
}
