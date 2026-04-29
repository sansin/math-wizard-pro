import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import type { Skill } from '@/types/core';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gradeBand = url.searchParams.get('gradeBand');
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
  return NextResponse.json({ skills });
}
