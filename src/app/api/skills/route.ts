import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { Skill } from '@/types/core';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gradeBand = url.searchParams.get('gradeBand');
  const withMastery = url.searchParams.get('withMastery') === '1';

  const sb = getServiceClient();
  let q = sb.from('skills').select('*');
  if (gradeBand) q = q.eq('grade_band', gradeBand);
  const { data, error } = await q.order('intrinsic_difficulty');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const skills: Skill[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    module: r.module as string,
    topic: r.topic as string,
    gradeBand: r.grade_band as Skill['gradeBand'],
    intrinsicDifficulty: r.intrinsic_difficulty as Skill['intrinsicDifficulty'],
    prerequisites: (r.prerequisites as string[]) ?? [],
    standards: (r.standards as string[]) ?? [],
  }));

  // Optionally attach the calling user's per-skill mastery so the
  // module selector can show "you've practiced this; here's your level"
  // without a second round-trip.
  let mastery: Record<string, { mastery: number; attempts: number; lastAttemptAt: string | null }> = {};
  if (withMastery) {
    const userClient = await getServerClient();
    const { data: auth } = await userClient.auth.getUser();
    if (auth?.user) {
      const skillIds = skills.map((s) => s.id);
      const { data: rows } = skillIds.length > 0
        ? await sb
            .from('skill_mastery')
            .select('skill_id, mastery, attempts, last_attempt_at')
            .eq('user_id', auth.user.id)
            .in('skill_id', skillIds)
        : { data: [] };
      for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
        mastery[r.skill_id as string] = {
          mastery: Number(r.mastery ?? 0),
          attempts: Number(r.attempts ?? 0),
          lastAttemptAt: (r.last_attempt_at as string) ?? null,
        };
      }
    }
  }

  return NextResponse.json({ skills, mastery });
}
