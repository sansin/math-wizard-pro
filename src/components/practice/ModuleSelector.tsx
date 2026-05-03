'use client';

import * as React from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { GradeBand, Skill } from '@/types/core';

/**
 * Module icons — same emoji per module name across grade bands so the user
 * develops a visual association ("➕" always means Addition, "🥧" always
 * Fractions). Falls back to 📘 for any unmapped module.
 */
const MODULE_ICONS: Record<string, string> = {
  'Number Sense': '🔢',
  'Counting': '🔢',
  'Addition': '➕',
  'Subtraction': '➖',
  'Multiplication': '✖️',
  'Division': '➗',
  'Arithmetic': '🔢',
  'Number Theory': '🔢',
  'Fractions': '🥧',
  'Decimals': '💯',
  'Ratios': '📊',
  'Pre-Algebra': '🔤',
  'Algebra': '🔤',
  'Functions': '📈',
  'Geometry': '📐',
  'Trigonometry': '📐',
  'Calculus': '∫',
  'Statistics': '📊',
  'Probability': '🎲',
  'Exponents': '⚡',
  'Measurement': '📏',
  'Logic': '🧩',
};

/**
 * Adventure-Quest jewel palette per module — gives each module a
 * recognizable color identity. Returns the hex pair used to tint the
 * module header (icon backdrop + accent bar). Defaults to wizard purple.
 */
interface ModuleTheme {
  /** Solid background for the icon chip (saturated). */
  iconBg: string;
  /** Text color for the icon chip — usually white. */
  iconFg: string;
  /** Soft tint for the header gradient. */
  tint: string;
  /** Darker shade for the accent bar / left border. */
  bar: string;
}

const MODULE_THEMES: Record<string, ModuleTheme> = {
  'Number Sense':   { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' }, // sapphire
  'Counting':       { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' },
  'Addition':       { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' }, // sapphire
  'Subtraction':    { iconBg: '#D11B3F', iconFg: '#fff', tint: '#FFEFF1', bar: '#A81131' }, // ruby
  'Multiplication': { iconBg: '#0E8B55', iconFg: '#fff', tint: '#E6FBF1', bar: '#0A6D43' }, // emerald
  'Division':       { iconBg: '#5F18D8', iconFg: '#fff', tint: '#F5EDFF', bar: '#4A11AB' }, // amethyst
  'Arithmetic':     { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' },
  'Number Theory':  { iconBg: '#0E8B55', iconFg: '#fff', tint: '#E6FBF1', bar: '#0A6D43' },
  'Fractions':      { iconBg: '#BD7A00', iconFg: '#fff', tint: '#FFF6E0', bar: '#956000' }, // topaz
  'Decimals':       { iconBg: '#0C8482', iconFg: '#fff', tint: '#E2FAFA', bar: '#086766' }, // aqua
  'Ratios':         { iconBg: '#D31D52', iconFg: '#fff', tint: '#FFEDF2', bar: '#A41441' }, // rose
  'Pre-Algebra':    { iconBg: '#570FBE', iconFg: '#fff', tint: '#F2E8FF', bar: '#430893' }, // violet2
  'Algebra':        { iconBg: '#570FBE', iconFg: '#fff', tint: '#F2E8FF', bar: '#430893' },
  'Functions':      { iconBg: '#0C8482', iconFg: '#fff', tint: '#E2FAFA', bar: '#086766' },
  'Geometry':       { iconBg: '#D8430E', iconFg: '#fff', tint: '#FFF1EA', bar: '#AA340A' }, // coral
  'Trigonometry':   { iconBg: '#D8430E', iconFg: '#fff', tint: '#FFF1EA', bar: '#AA340A' },
  'Calculus':       { iconBg: '#5F18D8', iconFg: '#fff', tint: '#F5EDFF', bar: '#4A11AB' },
  'Statistics':     { iconBg: '#D31D52', iconFg: '#fff', tint: '#FFEDF2', bar: '#A41441' },
  'Probability':    { iconBg: '#D31D52', iconFg: '#fff', tint: '#FFEDF2', bar: '#A41441' },
  'Exponents':      { iconBg: '#D69200', iconFg: '#fff', tint: '#FFFAEB', bar: '#A77000' }, // gold
  'Measurement':    { iconBg: '#0C8482', iconFg: '#fff', tint: '#E2FAFA', bar: '#086766' },
  'Logic':          { iconBg: '#570FBE', iconFg: '#fff', tint: '#F2E8FF', bar: '#430893' },
};

const DEFAULT_MODULE_THEME: ModuleTheme = {
  iconBg: '#7C4DFF',
  iconFg: '#fff',
  tint: '#F4F0FF',
  bar: '#5524BB',
};

/**
 * Build the inline `background` style for a skill row, where the row's
 * background fills left-to-right by mastery (0..1). Color shifts:
 *   - low mastery (0-30%):  pale ember (warm red)
 *   - mid mastery (30-70%): pale gold
 *   - high mastery (70%+):  pale leaf (green)
 *
 * For unselected rows we use a soft `linear-gradient` that gives a
 * "fill bar" feel without being noisy. Selected rows blend into a
 * wizard-tinted version so the selection state still reads clearly.
 */
function masteryBackgroundStyle(
  m: { mastery: number; attempts: number } | undefined,
  selected: boolean,
): React.CSSProperties | undefined {
  if (!m || m.attempts === 0) {
    return selected
      ? { background: '#F4F0FF' /* wizard-50 */ }
      : { background: '#FFFFFF' };
  }
  const pct = Math.max(2, Math.min(100, Math.round(m.mastery * 100)));
  // Pale fill colors (light enough that black text stays readable).
  const fill =
    m.mastery < 0.3 ? '#FFE3DC'        // ember-ish
    : m.mastery < 0.7 ? '#FFEEC2'      // spell-ish
    :                   '#D4F2DD';     // leaf-ish
  // The unfilled portion uses wizard-50 when selected, white otherwise,
  // so selection is still distinguishable from unselected.
  const rest = selected ? '#F4F0FF' : '#FFFFFF';
  return {
    background: `linear-gradient(to right, ${fill} 0%, ${fill} ${pct}%, ${rest} ${pct}%, ${rest} 100%)`,
  };
}

/** Human label for a mastery score (matches the practice screen vocabulary). */
function masteryLabel(mastery: number): string {
  if (mastery < 0.2) return 'Just started';
  if (mastery < 0.4) return 'Learning';
  if (mastery < 0.7) return 'Familiar';
  if (mastery < 0.9) return 'Solid';
  return 'Mastered';
}

/** A 5-dot meter for skill difficulty (intrinsic difficulty 1-5). */
function DifficultyDots({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0" aria-label={`Difficulty ${level} of 5`} title={`Difficulty ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            i <= level
              ? level <= 2 ? 'bg-leaf-400' : level === 3 ? 'bg-spell-400' : 'bg-ember-400'
              : 'bg-ink-200',
          )}
        />
      ))}
    </div>
  );
}

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

interface MasteryInfo {
  mastery: number;
  attempts: number;
  lastAttemptAt: string | null;
}

export function ModuleSelector({ studentName, defaultGradeBand, onStart }: ModuleSelectorProps) {
  const [gradeBand, setGradeBand] = React.useState<GradeBand>(defaultGradeBand);
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [mastery, setMastery] = React.useState<Record<string, MasteryInfo>>({});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);

  // Fetch skills + the user's mastery for the chosen grade band.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skills?gradeBand=${encodeURIComponent(gradeBand)}&withMastery=1`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSkills(data.skills ?? []);
        setMastery(data.mastery ?? {});
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
            <div className="space-y-7">
              {modules.map(([moduleName, moduleSkills]) => {
                const moduleSelectedCount = moduleSkills.filter((s) => selected.has(s.id)).length;
                const allSelected = moduleSelectedCount === moduleSkills.length;
                const moduleIcon = MODULE_ICONS[moduleName] ?? '📘';
                const theme = MODULE_THEMES[moduleName] ?? DEFAULT_MODULE_THEME;
                const toggleModule = () => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (allSelected) {
                      moduleSkills.forEach((s) => next.delete(s.id));
                    } else {
                      moduleSkills.forEach((s) => next.add(s.id));
                    }
                    return next;
                  });
                };

                return (
                  <section key={moduleName} aria-labelledby={`mod-${moduleName}`}>
                    {/* Prominent module header with jewel-tone identity */}
                    <div
                      className="flex items-end justify-between gap-3 pb-3 mb-3 rounded-xl px-3 pt-2.5 border-l-4"
                      style={{
                        background: `linear-gradient(90deg, ${theme.tint} 0%, transparent 60%)`,
                        borderLeftColor: theme.bar,
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0 shadow-sm"
                          style={{ background: theme.iconBg, color: theme.iconFg }}
                          aria-hidden
                        >
                          {moduleIcon}
                        </span>
                        <div className="min-w-0">
                          <h3
                            id={`mod-${moduleName}`}
                            className="font-display font-bold text-xl sm:text-2xl text-ink-900 leading-tight truncate"
                          >
                            {moduleName}
                          </h3>
                          <div className="text-xs text-ink-500">
                            {moduleSkills.length} skill{moduleSkills.length === 1 ? '' : 's'}
                            {moduleSelectedCount > 0 && (
                              <> · <span className="font-semibold" style={{ color: theme.bar }}>{moduleSelectedCount} selected</span></>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={toggleModule}
                        className={cn(
                          'shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border-2 transition-colors bg-white/70',
                        )}
                        style={
                          allSelected
                            ? { borderColor: theme.bar, color: theme.bar, background: theme.tint }
                            : { borderColor: '#E5E7EB', color: '#374151' }
                        }
                      >
                        {allSelected ? '☑ All selected' : 'Select all'}
                      </button>
                    </div>

                    {/* Compact skill rows — background fills left-to-right
                        based on the user's mastery for that skill. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {moduleSkills.map((s) => {
                        const sel = selected.has(s.id);
                        const m = mastery[s.id];
                        const masteryFill = masteryBackgroundStyle(m, sel);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggle(s.id)}
                            aria-pressed={sel}
                            style={masteryFill}
                            className={cn(
                              'relative flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all overflow-hidden',
                              sel
                                ? 'border-wizard-400'
                                : 'border-ink-100 hover:border-wizard-200',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded-md text-[10px] shrink-0 z-10',
                                sel ? 'bg-wizard-500 text-white' : 'bg-ink-100 text-ink-400',
                              )}
                              aria-hidden
                            >
                              {sel ? '✓' : ''}
                            </span>
                            <div className="flex-1 min-w-0 z-10">
                              <div className="font-medium text-sm text-ink-900 leading-tight truncate">
                                {s.name}
                              </div>
                              {m && m.attempts > 0 && (
                                <div className="text-2xs text-ink-500 mt-0.5">
                                  {masteryLabel(m.mastery)} · {Math.round(m.mastery * 100)}%
                                </div>
                              )}
                            </div>
                            <DifficultyDots level={s.intrinsicDifficulty} />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
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
