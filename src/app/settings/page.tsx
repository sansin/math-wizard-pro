import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { ProviderSettings } from '@/components/settings/ProviderSettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { xpProgress } from '@/lib/mastery/xp';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const sb = await getServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) redirect('/login');

  const service = getServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('display_name, age, grade_band, daily_goal, role')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const { data: xp } = await service
    .from('xp_state')
    .select('total_xp, level')
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
        dailyAnswered: 0,
      }}
    >
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <h1 className="font-display text-3xl font-bold text-ink-900">Settings</h1>

        <ProfileSettings
          initial={{
            displayName: (profile as { display_name?: string } | null)?.display_name ?? '',
            age: (profile as { age?: number } | null)?.age ?? null,
            gradeBand:
              ((profile as { grade_band?: string } | null)?.grade_band as
                | 'K-1' | '2-3' | '4-5' | '6-7' | '8-9' | '10-12') ?? '4-5',
            dailyGoal: (profile as { daily_goal?: number } | null)?.daily_goal ?? 10,
          }}
          email={auth.user.email ?? ''}
        />

        <ProviderSettings />
      </div>
    </AppShell>
  );
}
