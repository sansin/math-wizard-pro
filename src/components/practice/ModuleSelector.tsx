'use client';

import * as React from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { GradeBand, Skill } from '@/types/core';

const GRADE_BANDS: Array<{ id: GradeBand; label: string; tagline: string; icon: string; color: string }> = [
  { id: 'K-1',   label: 'Kindergarten – 1st',  tagline: 'Counting, simple math',         icon: '🎈', color: 'from-pink-400/20 to-rose-400/10 border-pink-200' },
  { id: '2-3',   label: '2nd – 3rd grade',     tagline: 'Multi-digit, multiplication',   icon: '🌟', color: 'from-amber-400/20 to-orange-400/10 border-amber-200' },
  { id: '4-5',   label: '4th – 5th grade',     tagline: 'Fractions, decimals, geometry', icon: '🎯', color: 'from-emerald-400/20 to-teal-400/10 border-emerald-200' },
  { id: '6-7',   label: '6th – 7th grade',     tagline: 'Pre-algebra, ratios',           icon: '🚀', color: 'from-sky-400/20 to-cyan-400/10 border-sky-200' },
  { id: '8-9',   label: '8th – 9th grade',     tagline: 'Algebra, exponents',            icon: '⚡', color: 'from-violet-400/20 to-purple-400/10 border-violet-200' },
  { id: '10-12', label: '10th – 12th grade',   tagline: 'Trig, calculus',                icon: '🏆', color: 'from-indigo-400/20 to-blue-400/10 border-indigo-200' },
];

export interface ModuleSelectorProps {
  studentName: string;
  defaultGradeBand: GradeBand;
  onStart: (config: { gradeBand: GradeBand; skillIds: string[]; mode: 'practice' | 'test' }) => void;
}

export function ModuleSelector({ studentName, defaultGradeBand, onStart }: ModuleSelectorProps) {
  const [gradeBand, setGradeBand] = React.useState<GradeBand>(defaultGradeBand);
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);

  // Fetch skills for the chosen grade band.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skills?gradeBand=${encodeURIComponent(gradeBand)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSkills(data.skills ?? []);
        setSelected(new Set());
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [gradeBand]);

  // Group skills by module for cleaner display.
  const modules = React.useMemo(() => {
    const map = new Map<string, Skill[]>();
    for (const s of skills) {
      const arr = map.get(s.module) ?? [];
      arr.push(s);
      map.set(s.module, arr);
    }
    return Array.from(map.entries());
  }, [skills]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(skills.map((s) => s.id)));
  const clearAll = () => setSelected(new Set());

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink-900">
            Hi, {studentName} 👋
          </h1>
          <p className="text-ink-600 mt-1">Pick a grade and choose what you want to practice.</p>
        </div>
      </div>

      {/* Grade bands */}
      <Card>
        <CardBody>
          <h2 className="font-display font-bold text-ink-900 text-base mb-3">🎓 Choose your grade</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {GRADE_BANDS.map((g) => {
              const sel = g.id === gradeBand;
              return (
                <button
                  key={g.id}
                  onClick={() => setGradeBand(g.id)}
                  aria-pressed={sel}
                  className={cn(
                    'rounded-2xl p-3 text-left transition-all border-2',
                    sel
                      ? 'border-wizard-500 bg-wizard-50 shadow-wizard'
                      : 'border-ink-100 bg-white hover:border-wizard-200 hover:bg-wizard-50/40',
                  )}
                >
                  <div className="text-2xl mb-1">{g.icon}</div>
                  <div className="font-bold text-sm text-ink-900">{g.id}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{g.tagline}</div>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Modules */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-ink-900 text-base">📚 Choose your skills</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-16 w-full" />
              ))}
            </div>
          ) : modules.length === 0 ? (
            <div className="text-center py-6 text-ink-500 text-sm">
              No skills found for this grade. Try another.
            </div>
          ) : (
            <div className="space-y-5">
              {modules.map(([moduleName, moduleSkills]) => (
                <div key={moduleName}>
                  <div className="text-2xs uppercase tracking-wider font-bold text-ink-500 mb-1.5 px-1">
                    {moduleName}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {moduleSkills.map((s) => {
                      const sel = selected.has(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggle(s.id)}
                          aria-pressed={sel}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all',
                            sel
                              ? 'border-wizard-500 bg-wizard-50'
                              : 'border-ink-100 bg-white hover:border-wizard-200 hover:bg-wizard-50/40',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md text-xs shrink-0',
                              sel ? 'bg-wizard-500 text-white' : 'bg-ink-100 text-ink-500',
                            )}
                            aria-hidden
                          >
                            {sel ? '✓' : ''}
                          </span>
                          <div className="flex-1">
                            <div className="font-semibold text-sm text-ink-900 leading-tight">
                              {s.name}
                            </div>
                            <div className="text-xs text-ink-500 mt-0.5">
                              {s.topic} · Difficulty {s.intrinsicDifficulty}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Action bar */}
      <div className="sticky bottom-4 z-10">
        <Card className="shadow-wizard-lg">
          <CardBody className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 text-sm text-ink-600">
              {selected.size === 0
                ? <>Pick at least one skill to begin.</>
                : <><strong>{selected.size}</strong> skill{selected.size === 1 ? '' : 's'} selected.</>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                size="lg"
                variant="primary"
                disabled={selected.size === 0}
                onClick={() => onStart({ gradeBand, skillIds: Array.from(selected), mode: 'practice' })}
              >
                🎯 Practice
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={selected.size === 0}
                onClick={() => onStart({ gradeBand, skillIds: Array.from(selected), mode: 'test' })}
              >
                📝 Test (10 Q)
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
