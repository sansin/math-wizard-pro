import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { PracticeClient } from './PracticeClient';
import { xpProgress } from '@/lib/mastery/xp';

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  const sb = await getServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) redirect('/login');

  const service = getServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('display_name, grade_band, daily_goal')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const { data: xp } = await service
    .from('xp_state')
    .select('total_xp, level, daily_answered')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const xpVal = (xp as { total_xp?: number } | null)?.total_xp ?? 0;
  const progress = xpProgress(xpVal);

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
      <PracticeClient
        studentName={(profile as { display_name?: string } | null)?.display_name ?? 'Wizard'}
        gradeBand={
          ((profile as { grade_band?: string } | null)?.grade_band as
            | 'K-1' | '2-3' | '4-5' | '6-7' | '8-9' | '10-12') ?? '4-5'
        }
      />
    </AppShell>
  );
}
