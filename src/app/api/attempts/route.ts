/**
 * POST /api/attempts
 *
 * Records an attempt. Server-side parses + checks the answer (don't trust the
 * client). The mastery + XP triggers update the rest of the user's state.
 *
 * Body: { questionId, sessionId?, submitted, hintsUsed, timeMs }
 *
 * Returns: { correct, parsed, xpEarned, newTotalXP, newLevel }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { parseUserAnswer } from '@/lib/math/parser';
import { checkAnswer } from '@/lib/math/checker';
import { areEquivalent } from '@/lib/math/equivalence';
import { calculateXP } from '@/lib/mastery/xp';
import type { AnswerKind } from '@/types/core';

const Body = z.object({
  questionId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  submitted: z.string().min(1).max(200),
  hintsUsed: z.number().int().min(0).max(3).default(0),
  timeMs: z.number().int().min(0).max(15 * 60_000),
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = auth.user.id;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid-body', detail: (e as Error).message }, { status: 400 });
  }

  const sb = getServiceClient();

  // Load the question to get the verified answer + skill + difficulty.
  const { data: q, error: qErr } = await sb
    .from('questions')
    .select('id, skill_id, difficulty, answer')
    .eq('id', body.questionId)
    .maybeSingle();

  if (qErr || !q) {
    return NextResponse.json({ error: 'question-not-found' }, { status: 404 });
  }

  const expected = (q as Record<string, unknown>).answer as AnswerKind;
  const parsed = parseUserAnswer(body.submitted);
  let result = checkAnswer(parsed, expected);

  // Symbolic-equivalence fallback for expressions / equations.
  // The simple checker compares canonical strings — but "y=240-4x" and
  // "240-4x=y" are mathematically the same. mathjs handles that here.
  if (!result.correct && expected.type === 'expression') {
    if (areEquivalent(body.submitted, expected.canonical)) {
      result = { correct: true };
    }
  }
  // Also: if the question expected a NUMERIC answer but the user typed an
  // algebraic form like "x = 5", strip the LHS and try the RHS as numeric.
  if (!result.correct && expected.type === 'numeric' && body.submitted.includes('=')) {
    const rhs = body.submitted.split('=').slice(-1)[0]!.trim();
    const reparsed = parseUserAnswer(rhs);
    const retry = checkAnswer(reparsed, expected);
    if (retry.correct) result = retry;
  }

  // Look up current XP streak to compute the optimistic XP estimate.
  const { data: xp } = await sb
    .from('xp_state')
    .select('total_xp, level, current_streak')
    .eq('user_id', userId)
    .maybeSingle();
  const streak = (xp as { current_streak?: number } | null)?.current_streak ?? 0;
  const xpEarned = calculateXP({
    correct: result.correct,
    difficulty: (q as { difficulty: number }).difficulty as 1 | 2 | 3 | 4 | 5,
    streak,
    hintsUsed: body.hintsUsed,
  });

  // Record the attempt — the trigger handles mastery + XP updates.
  const { error: insErr } = await sb.from('attempts').insert({
    user_id: userId,
    session_id: body.sessionId ?? null,
    question_id: body.questionId,
    skill_id: (q as { skill_id: string }).skill_id,
    difficulty: (q as { difficulty: number }).difficulty,
    submitted: body.submitted,
    parsed: parsed.kind === 'invalid' ? null : parsed,
    correct: result.correct,
    hints_used: body.hintsUsed,
    time_ms: body.timeMs,
  });
  if (insErr) {
    return NextResponse.json({ error: 'persist-failed', detail: insErr.message }, { status: 500 });
  }

  // Re-read the post-trigger XP state (so the UI gets the real numbers).
  const { data: xpAfter } = await sb
    .from('xp_state')
    .select('total_xp, level, current_streak, longest_streak, daily_answered, weekly_answered')
    .eq('user_id', userId)
    .maybeSingle();

  return NextResponse.json({
    correct: result.correct,
    parsed: parsed.kind === 'invalid' ? null : parsed,
    expected,
    xpEarned,
    xp: xpAfter ?? null,
  });
}
