'use client';

import * as React from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { cn } from '@/lib/utils';

export interface StudentDashboardProps {
  displayName: string;
  levelTitle: string;
  xp: { total: number; level: number; progress: number; nextAt: number };
  streak: number;
  longest: number;
  dailyGoal: number;
  dailyAnswered: number;
  attempts: Array<{ correct: boolean; attempted_at: string; skill_id: string; difficulty: number }>;
  mastery: Array<{ skill_id: string; mastery: number; attempts: number; correct_streak: number }>;
  skillNames: Record<string, string>;
}

export function StudentDashboard(props: StudentDashboardProps) {
  // Compute derived stats
  const total = props.attempts.length;
  const correct = props.attempts.filter((a) => a.correct).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Daily series — last 14 days
  const series = React.useMemo(() => {
    const buckets = new Map<string, { date: string; total: number; correct: number }>();
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, total: 0, correct: 0 });
    }
    for (const a of props.attempts) {
      const key = a.attempted_at.slice(0, 10);
      const b = buckets.get(key);
      if (b) {
        b.total++;
        if (a.correct) b.correct++;
      }
    }
    return Array.from(buckets.values()).map((b) => ({
      label: new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      total: b.total,
      accuracy: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
    }));
  }, [props.attempts]);

  // Top mastery
  const topMastery = React.useMemo(() => {
    return [...props.mastery]
      .sort((a, b) => b.mastery - a.mastery)
      .slice(0, 6)
      .map((m) => ({
        name: props.skillNames[m.skill_id] ?? m.skill_id,
        mastery: Math.round(m.mastery * 100),
      }));
  }, [props.mastery, props.skillNames]);

  // Skills to focus on (lowest mastery, attempts > 0)
  const focusOn = React.useMemo(() => {
    return props.mastery
      .filter((m) => m.attempts > 0)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 4)
      .map((m) => ({
        name: props.skillNames[m.skill_id] ?? m.skill_id,
        mastery: Math.round(m.mastery * 100),
        attempts: m.attempts,
      }));
  }, [props.mastery, props.skillNames]);

  const goalPct = Math.min(100, Math.round((props.dailyAnswered / Math.max(1, props.dailyGoal)) * 100));

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Your progress</h1>
        <p className="text-ink-600 mt-0.5">
          Hi {props.displayName} — here&apos;s how it&apos;s going.
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="⚡" label={`Lv. ${props.xp.level}`} value={props.levelTitle} sub={`${props.xp.total} XP`} />
        <StatCard icon="🔥" label="Streak" value={`${props.streak}`} sub={`Longest ${props.longest}`} />
        <StatCard icon="🎯" label="Accuracy" value={`${accuracy}%`} sub={`${total} answers`} />
        <StatCard icon="📋" label="Today" value={`${props.dailyAnswered}/${props.dailyGoal}`} sub={`${goalPct}% of goal`} />
      </div>

      {/* Activity chart */}
      <Card>
        <CardBody>
          <h2 className="font-display font-bold text-ink-900 mb-3">Last 14 days</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#EDEDF5" vertical={false} />
                <XAxis dataKey="label" stroke="#8B8BA8" fontSize={11} tickLine={false} />
                <YAxis stroke="#8B8BA8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#7C4DFF" strokeWidth={2.5} dot={{ r: 3 }} name="Questions" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Strengths */}
        <Card>
          <CardBody>
            <h2 className="font-display font-bold text-ink-900 mb-3">🌟 Your strengths</h2>
            {topMastery.length === 0 ? (
              <p className="text-sm text-ink-500">No data yet. Practice more to fill this in.</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topMastery} layout="vertical" margin={{ left: -8 }}>
                    <CartesianGrid stroke="#EDEDF5" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} stroke="#8B8BA8" fontSize={11} />
                    <YAxis type="category" dataKey="name" stroke="#8B8BA8" fontSize={11} width={120} />
                    <Tooltip />
                    <Bar dataKey="mastery" radius={[0, 6, 6, 0]}>
                      {topMastery.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? '#1F9D49' : '#3DB562'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Focus areas */}
        <Card>
          <CardBody>
            <h2 className="font-display font-bold text-ink-900 mb-3">🎯 Worth practicing more</h2>
            {focusOn.length === 0 ? (
              <p className="text-sm text-ink-500">Once you&apos;ve attempted a few skills, we&apos;ll surface what to focus on.</p>
            ) : (
              <ul className="space-y-2">
                {focusOn.map((s) => (
                  <li key={s.name} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink-900 text-sm truncate">{s.name}</div>
                      <div className="text-xs text-ink-500">{s.attempts} attempts</div>
                    </div>
                    <div className="w-32 h-2 rounded-full bg-ink-100 overflow-hidden">
                      <div
                        className={cn(
                          'h-full',
                          s.mastery < 30 ? 'bg-ember-400' : s.mastery < 60 ? 'bg-spell-400' : 'bg-leaf-400',
                        )}
                        style={{ width: `${s.mastery}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold w-8 text-right">{s.mastery}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardBody className="!py-4">
        <div className="text-2xl mb-1" aria-hidden>{icon}</div>
        <div className="text-2xs uppercase tracking-wider font-bold text-ink-500">{label}</div>
        <div className="font-display font-bold text-xl text-ink-900 leading-tight">{value}</div>
        <div className="text-xs text-ink-500 mt-0.5">{sub}</div>
      </CardBody>
    </Card>
  );
}
