/**
 * POST /api/parent/digest
 *
 * Generates a short, parent-facing narrative summary of the child's week.
 * Uses the AI router (any provider) — small request, very cheap.
 */

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveKeysForUser, bumpSharedUsage } from '@/lib/ai/key-resolver';
import { route } from '@/lib/ai/router';

export const runtime = 'nodejs';

export async function POST() {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const userId = auth.user.id;

  const sb = getServiceClient();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [{ data: profile }, { data: attempts }, { data: mastery }] = await Promise.all([
    sb.from('profiles').select('display_name, grade_band').eq('user_id', userId).maybeSingle(),
    sb.from('attempts').select('correct, attempted_at, skill_id, difficulty')
      .eq('user_id', userId).gte('attempted_at', since),
    sb.from('skill_mastery').select('skill_id, mastery, attempts').eq('user_id', userId),
  ]);

  const attemptRows = (attempts ?? []) as Array<{ correct: boolean; attempted_at: string; skill_id: string; difficulty: number }>;
  const total = attemptRows.length;
  const correct = attemptRows.filter((a) => a.correct).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const days = new Set(attemptRows.map((a) => a.attempted_at.slice(0, 10))).size;

  const masteryRows = (mastery ?? []) as Array<{ skill_id: string; mastery: number; attempts: number }>;
  const topSkill = [...masteryRows].sort((a, b) => b.mastery - a.mastery)[0];
  const weakSkill = [...masteryRows]
    .filter((m) => m.attempts >= 3)
    .sort((a, b) => a.mastery - b.mastery)[0];

  const skillIds = [topSkill?.skill_id, weakSkill?.skill_id].filter(Boolean) as string[];
  const { data: skills } = skillIds.length
    ? await sb.from('skills').select('id, name').in('id', skillIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const skillRows = (skills ?? []) as Array<{ id: string; name: string }>;
  const nameOf = Object.fromEntries(skillRows.map((s) => [s.id, s.name]));

  const childName = (profile as { display_name?: string } | null)?.display_name ?? 'your child';
  const grade = (profile as { grade_band?: string } | null)?.grade_band ?? '';

  const stats = `Stats this week: ${total} questions over ${days}/7 days, ${accuracy}% accuracy.
Top mastery: ${topSkill ? nameOf[topSkill.skill_id] : 'n/a'} (${topSkill ? Math.round(topSkill.mastery * 100) : 0}%).
Lowest mastery (3+ attempts): ${weakSkill ? nameOf[weakSkill.skill_id] : 'n/a'} (${weakSkill ? Math.round(weakSkill.mastery * 100) : 0}%).`;

  const keys = await resolveKeysForUser(userId);
  if (keys.byok.length === 0 && keys.shared.length === 0) {
    return NextResponse.json({
      narrative: `${childName} answered ${total} questions across ${days} day${days === 1 ? '' : 's'} this week with ${accuracy}% accuracy. Add an AI provider key in Settings → AI Providers for a personalized weekly summary.`,
    });
  }

  try {
    const result = await route(
      {
        task: 'tutor-chat',
        system:
          'You write a short, warm 2-3 sentence weekly summary for a parent about their child\'s math practice. Be specific (cite the numbers and skill names). Highlight ONE strength and ONE area to support. End with a concrete suggestion they can do together this weekend (under 1 sentence). No bullet points. No emoji.',
        user: `Child: ${childName} (grade ${grade}).\n${stats}`,
        temperature: 0.5,
        maxTokens: 220,
      },
      keys.ctx,
    );
    const usedAdmin = result.attempts.some((a) => a.ok && !keys.ctx.userKeys[a.provider as keyof typeof keys.ctx.userKeys]);
    if (usedAdmin) await bumpSharedUsage(userId);

    return NextResponse.json({ narrative: result.response.content.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: 'generation-failed', detail: (e as Error).message },
      { status: 502 },
    );
  }
}
