import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { ParentDashboard } from '@/components/parent/ParentDashboard';
import { xpProgress, levelForXP } from '@/lib/mastery/xp';

export const dynamic = 'force-dynamic';

export default async function ParentPage() {
  const sb = await getServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) redirect('/login');
  const userId = auth.user.id;

  const service = getServiceClient();

  // For now, the parent view shows the *current user*'s data with a parent
  // framing — covers the common case where the child is the account holder.
  // Multi-account parent linking is in the parent_links table; this view
  // can be extended to a child picker once that's exposed in the UI.
  const [{ data: profile }, { data: xp }, { data: attemptsRaw }, { data: masteryRaw }] = await Promise.all([
    service.from('profiles')
      .select('display_name, grade_band')
      .eq('user_id', userId).maybeSingle(),
    service.from('xp_state').select('*').eq('user_id', userId).maybeSingle(),
    service.from('attempts')
      .select('correct, attempted_at, skill_id, difficulty, time_ms')
      .eq('user_id', userId)
      .order('attempted_at', { ascending: false })
      .limit(500),
    service.from('skill_mastery')
      .select('skill_id, mastery, attempts')
      .eq('user_id', userId),
  ]);

  const masteryRows = (masteryRaw ?? []) as Array<{ skill_id: string; mastery: number; attempts: number }>;
  const attemptRows = (attemptsRaw ?? []) as Array<{ correct: boolean; attempted_at: string; skill_id: string; difficulty: number; time_ms: number }>;
  const skillIds = new Set([
    ...masteryRows.map((m) => m.skill_id),
    ...attemptRows.map((a) => a.skill_id),
  ]);
  const { data: skills } = skillIds.size > 0
    ? await service.from('skills').select('id, name').in('id', Array.from(skillIds))
    : { data: [] as Array<{ id: string; name: string }> };
  const skillRows = (skills ?? []) as Array<{ id: string; name: string }>;
  const skillNames = Object.fromEntries(skillRows.map((s) => [s.id, s.name]));

  const xpVal = (xp as { total_xp?: number } | null)?.total_xp ?? 0;
  const progress = xpProgress(xpVal);
  const lvl = levelForXP(xpVal);

  return (
    <AppShell
      v1Url={process.env.NEXT_PUBLIC_V1_URL}
      user={{
        name: (profile as { display_name?: string } | null)?.display_name ?? 'Wizard',
        level: (xp as { level?: number } | null)?.level ?? 1,
        xp: xpVal,
        nextLevelXP: progress.next,
        dailyGoal: 10,
        dailyAnswered: 0,
      }}
    >
      <ParentDashboard
        childName={(profile as { display_name?: string } | null)?.display_name ?? 'your child'}
        gradeBand={
          ((profile as { grade_band?: string } | null)?.grade_band as
            | 'K-1' | '2-3' | '4-5' | '6-7' | '8-9' | '10-12') ?? '4-5'
        }
        levelTitle={lvl.title}
        totalXP={xpVal}
        attempts={(attemptsRaw ?? []) as Array<{ correct: boolean; attempted_at: string; skill_id: string; difficulty: number; time_ms: number }>}
        mastery={(masteryRaw ?? []) as Array<{ skill_id: string; mastery: number; attempts: number }>}
        skillNames={skillNames}
      />
    </AppShell>
  );
}
