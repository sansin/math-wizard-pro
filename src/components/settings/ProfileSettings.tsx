'use client';

import * as React from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getBrowserClient } from '@/lib/supabase/browser';
import type { GradeBand } from '@/types/core';
import { useRouter } from 'next/navigation';

export interface ProfileSettingsProps {
  initial: {
    displayName: string;
    age: number | null;
    gradeBand: GradeBand;
    dailyGoal: number;
  };
  email: string;
}

export function ProfileSettings({ initial, email }: ProfileSettingsProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = React.useState(initial.displayName);
  const [age, setAge] = React.useState<string>(initial.age?.toString() ?? '');
  const [gradeBand, setGradeBand] = React.useState<GradeBand>(initial.gradeBand);
  const [dailyGoal, setDailyGoal] = React.useState<string>(initial.dailyGoal.toString());
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const sb = getBrowserClient();
      const { data: auth } = await sb.auth.getUser();
      if (!auth?.user) throw new Error('Not signed in');
      const update = {
        display_name: displayName.trim() || 'Wizard',
        age: age ? parseInt(age, 10) : null,
        grade_band: gradeBand,
        daily_goal: parseInt(dailyGoal, 10) || 10,
      };
      const { error } = await (sb.from('profiles') as unknown as { update: (u: typeof update) => { eq: (col: string, val: string) => Promise<{ error: Error | null }> } })
        .update(update)
        .eq('user_id', auth.user.id);
      if (error) throw error;
      setMsg('Saved!');
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    const sb = getBrowserClient();
    await sb.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <Card>
      <CardBody>
        <h2 className="font-display text-xl font-bold mb-1">Profile</h2>
        <p className="text-sm text-ink-600 mb-4">Update your wizard&apos;s details.</p>

        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
              Email
            </label>
            <Input value={email} disabled />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                Display name
              </label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                Age
              </label>
              <Input
                type="number"
                min={3}
                max={99}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                Grade band
              </label>
              <select
                value={gradeBand}
                onChange={(e) => setGradeBand(e.target.value as GradeBand)}
                className="h-12 w-full rounded-xl border border-ink-200 bg-white px-3 text-base"
              >
                <option value="K-1">K – 1</option>
                <option value="2-3">2 – 3</option>
                <option value="4-5">4 – 5</option>
                <option value="6-7">6 – 7</option>
                <option value="8-9">8 – 9</option>
                <option value="10-12">10 – 12</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                Daily goal (questions)
              </label>
              <Input
                type="number"
                min={1}
                max={100}
                value={dailyGoal}
                onChange={(e) => setDailyGoal(e.target.value)}
              />
            </div>
          </div>

          {msg && (
            <div className="rounded-xl bg-leaf-50 border border-leaf-200 p-3 text-sm text-leaf-800">
              {msg}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="submit" loading={saving}>Save changes</Button>
            <Button type="button" variant="ghost" onClick={signOut}>Sign out</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
