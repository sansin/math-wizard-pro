'use client';

import * as React from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import type { GradeBand } from '@/types/core';
import { formatDuration } from '@/lib/utils';

const PIE_COLORS = ['#7C4DFF', '#FFAA00', '#1F9D49', '#E14823', '#9870FF', '#3DB562'];

export interface ParentDashboardProps {
  childName: string;
  gradeBand: GradeBand;
  levelTitle: string;
  totalXP: number;
  attempts: Array<{ correct: boolean; attempted_at: string; skill_id: string; difficulty: number; time_ms: number }>;
  mastery: Array<{ skill_id: string; mastery: number; attempts: number }>;
  skillNames: Record<string, string>;
}

export function ParentDashboard(p: ParentDashboardProps) {
  const [digest, setDigest] = React.useState<string | null>(null);
  const [digestLoading, setDigestLoading] = React.useState(false);
  const [digestError, setDigestError] = React.useState<string | null>(null);

  // Last-7-days bucket
  const weekly = React.useMemo(() => {
    const buckets = new Map<string, { date: string; total: number; correct: number }>();
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, total: 0, correct: 0 });
    }
    for (const a of p.attempts) {
      const key = a.attempted_at.slice(0, 10);
      const b = buckets.get(key);
      if (b) {
        b.total++;
        if (a.correct) b.correct++;
      }
    }
    return Array.from(buckets.values()).map((b) => ({
      label: new Date(b.date).toLocaleDateString('en-US', { weekday: 'short' }),
      total: b.total,
      accuracy: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
    }));
  }, [p.attempts]);

  const totalThisWeek = weekly.reduce((sum, w) => sum + w.total, 0);
  const correctThisWeek = p.attempts.filter((a) => withinDays(a.attempted_at, 7) && a.correct).length;
  const accuracyThisWeek = totalThisWeek > 0 ? Math.round((correctThisWeek / totalThisWeek) * 100) : 0;
  const daysActive = weekly.filter((d) => d.total > 0).length;
  const minutesThisWeek = Math.round(
    p.attempts.filter((a) => withinDays(a.attempted_at, 7)).reduce((sum, a) => sum + a.time_ms, 0) / 60000,
  );

  // Topic breakdown — sum attempts per module group via skillNames mapping.
  const topicData = React.useMemo(() => {
    const groups = new Map<string, number>();
    for (const a of p.attempts) {
      const name = p.skillNames[a.skill_id] ?? a.skill_id;
      const moduleKey = name.split(' ')[0] ?? name; // simple grouping
      groups.set(moduleKey, (groups.get(moduleKey) ?? 0) + 1);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));
  }, [p.attempts, p.skillNames]);

  // Strengths & focus
  const top = [...p.mastery].sort((a, b) => b.mastery - a.mastery)[0];
  const weakest = [...p.mastery]
    .filter((m) => m.attempts >= 3)
    .sort((a, b) => a.mastery - b.mastery)[0];

  async function generateDigest() {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const res = await fetch('/api/parent/digest', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || 'Could not generate digest');
      setDigest(d.narrative);
    } catch (e) {
      setDigestError((e as Error).message);
    } finally {
      setDigestLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Parent dashboard</h1>
        <p className="text-ink-600 mt-0.5">
          A read-only summary of {p.childName}&apos;s progress.
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Grade" value={p.gradeBand} />
            <Stat label="Level" value={p.levelTitle} sub={`${p.totalXP} XP`} />
            <Stat label="Days active (7d)" value={`${daysActive}/7`} />
            <Stat label="Time this week" value={formatMinutes(minutesThisWeek)} />
          </div>
        </CardBody>
      </Card>

      {/* Weekly digest narrative */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-ink-900">📝 Weekly summary</h2>
            <Button size="sm" loading={digestLoading} onClick={generateDigest} variant="secondary">
              {digest ? 'Refresh' : 'Generate'}
            </Button>
          </div>
          {digest ? (
            <p className="text-sm text-ink-700 leading-relaxed">{digest}</p>
          ) : digestError ? (
            <p className="text-sm text-ember-700">{digestError}</p>
          ) : (
            <p className="text-sm text-ink-500">
              Click Generate to get a short, AI-written summary of how this week is going.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <h2 className="font-display font-bold text-ink-900 mb-3">Daily activity</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="#EDEDF5" vertical={false} />
                  <XAxis dataKey="label" stroke="#8B8BA8" fontSize={11} />
                  <YAxis stroke="#8B8BA8" fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#7C4DFF" radius={[6, 6, 0, 0]} name="Questions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-sm text-ink-600">
              <strong>{totalThisWeek}</strong> questions answered, <strong>{accuracyThisWeek}%</strong> accuracy.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-display font-bold text-ink-900 mb-3">Topics practiced</h2>
            {topicData.length === 0 ? (
              <p className="text-sm text-ink-500">No data yet.</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={topicData} dataKey="value" innerRadius={40} outerRadius={75} paddingAngle={2}>
                      {topicData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Strengths / focus */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <h3 className="font-display font-bold text-ink-900 mb-2">🌟 Top strength</h3>
            {top ? (
              <div>
                <div className="font-semibold">{p.skillNames[top.skill_id] ?? top.skill_id}</div>
                <div className="text-sm text-ink-500">{Math.round(top.mastery * 100)}% mastery · {top.attempts} attempts</div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Not enough data yet.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="font-display font-bold text-ink-900 mb-2">🎯 Worth practicing</h3>
            {weakest ? (
              <div>
                <div className="font-semibold">{p.skillNames[weakest.skill_id] ?? weakest.skill_id}</div>
                <div className="text-sm text-ink-500">{Math.round(weakest.mastery * 100)}% mastery · {weakest.attempts} attempts</div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Not enough data yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="text-2xs uppercase tracking-wider font-bold text-ink-500">{label}</div>
      <div className="font-display font-bold text-lg text-ink-900 leading-tight">{value}</div>
      {sub && <div className="text-xs text-ink-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function withinDays(iso: string, days: number) {
  const t = new Date(iso).getTime();
  return Date.now() - t <= days * 86400_000;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
