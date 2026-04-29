import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { StudentDashboard } from '@/components/dashboard/StudentDashboard';
import { xpProgress, levelForXP } from '@/lib/mastery/xp';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sb = await getServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) redirect('/login');
  const userId = auth.user.id;

  const service = getServiceClient();

  const [{ data: profile }, { data: xp }, { data: attemptsRaw }, { data: masteryRaw }] = await Promise.all([
    service.from('profiles')
      .select('display_name, grade_band, daily_goal')
      .eq('user_id', userId).maybeSingle(),
    service.from('xp_state').select('*').eq('user_id', userId).maybeSingle(),
    service.from('attempts')
      .select('correct, attempted_at, skill_id, difficulty')
      .eq('user_id', userId)
      .order('attempted_at', { ascending: false })
      .limit(500),
    service.from('skill_mastery')
      .select('skill_id, mastery, attempts, correct_streak')
      .eq('user_id', userId),
  ]);

  // Skill names
  const masteryRows = (masteryRaw ?? []) as Array<{ skill_id: string; mastery: number; attempts: number; correct_streak: number }>;
  const attemptRows = (attemptsRaw ?? []) as Array<{ correct: boolean; attempted_at: string; skill_id: string; difficulty: number }>;
  const skillIds = new Set([
    ...masteryRows.map((m) => m.skill_id),
    ...attemptRows.map((a) => a.skill_id),
  ]);
  const { data: skills } = skillIds.size > 0
    ? await service.from('skills').select('id, name, module').in('id', Array.from(skillIds))
    : { data: [] as Array<{ id: string; name: string; module: string }> };

  const skillRows = (skills ?? []) as Array<{ id: string; name: string; module: string }>;
  const skillNameMap = new Map<string, string>();
  for (const s of skillRows) skillNameMap.set(s.id, s.name);

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
        dailyGoal: (profile as { daily_goal?: number } | null)?.daily_goal ?? 10,
        dailyAnswered: (xp as { daily_answered?: number } | null)?.daily_answered ?? 0,
      }}
    >
      <StudentDashboard
        displayName={(profile as { display_name?: string } | null)?.display_name ?? 'Wizard'}
        levelTitle={lvl.title}
        xp={{
          total: xpVal,
          level: lvl.level,
          progress: progress.pct,
          nextAt: progress.next,
        }}
        streak={(xp as { current_streak?: number } | null)?.current_streak ?? 0}
        longest={(xp as { longest_streak?: number } | null)?.longest_streak ?? 0}
        dailyGoal={(profile as { daily_goal?: number } | null)?.daily_goal ?? 10}
        dailyAnswered={(xp as { daily_answered?: number } | null)?.daily_answered ?? 0}
        attempts={(attemptsRaw ?? []) as Array<{ correct: boolean; attempted_at: string; skill_id: string; difficulty: number }>}
        mastery={(masteryRaw ?? []) as Array<{ skill_id: string; mastery: number; attempts: number; correct_streak: number }>}
        skillNames={Object.fromEntries(skillNameMap)}
      />
    </AppShell>
  );
}
