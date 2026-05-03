'use client';

import * as React from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import {
  distinctModules,
  groupSkillsByGradeAndDifficulty,
  moduleProgress,
  unmetPrerequisites,
  type MasteryInfo,
} from '@/lib/mastery/skill-grouping';
import type { Skill } from '@/types/core';

/**
 * "By module" practice picker. Shows skills across grade bands grouped
 * under a chosen module (Addition, Algebra, Geometry, etc.).
 *
 * Sorting rule (decided up-front, not configurable here): grade band
 * first (chronological), then intrinsic difficulty within the band.
 * That matches how schools sequence the curriculum and gives a
 * "learning ladder" feel.
 *
 * Prerequisites: we never lock skills. If a skill's prerequisites aren't
 * yet mastered (mastery < 0.5 or never attempted), we show a small
 * warning indicator with a tooltip listing the missing prereqs. Users
 * can still select and practice; adaptivity handles difficulty.
 */
export interface ModuleViewProps {
  skills: Skill[];
  mastery: Record<string, MasteryInfo>;
  selected: Set<string>;
  onToggle: (skillId: string) => void;
  onSelectAllInModule: (skillIds: string[], allCurrentlySelected: boolean) => void;
  /** Optional initial module — usually persisted by the parent. Falls back
   *  to the highest-mastery module so the user lands somewhere meaningful. */
  initialModule?: string;
}

// Per-module color identity — matches the palette in the grade view.
// Kept inline (not imported) to avoid a circular module dep.
interface ModuleTheme {
  iconBg: string;
  iconFg: string;
  tint: string;
  bar: string;
}
const DEFAULT_MODULE_THEME: ModuleTheme = {
  iconBg: '#7C4DFF',
  iconFg: '#fff',
  tint: '#F4F0FF',
  bar: '#5524BB',
};
const MODULE_THEMES: Record<string, ModuleTheme> = {
  'Number Sense':   { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' },
  'Counting':       { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' },
  'Addition':       { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' },
  'Subtraction':    { iconBg: '#D11B3F', iconFg: '#fff', tint: '#FFEFF1', bar: '#A81131' },
  'Multiplication': { iconBg: '#0E8B55', iconFg: '#fff', tint: '#E6FBF1', bar: '#0A6D43' },
  'Division':       { iconBg: '#5F18D8', iconFg: '#fff', tint: '#F5EDFF', bar: '#4A11AB' },
  'Arithmetic':     { iconBg: '#1746C2', iconFg: '#fff', tint: '#EAF1FF', bar: '#11369A' },
  'Number Theory':  { iconBg: '#0E8B55', iconFg: '#fff', tint: '#E6FBF1', bar: '#0A6D43' },
  'Fractions':      { iconBg: '#BD7A00', iconFg: '#fff', tint: '#FFF6E0', bar: '#956000' },
  'Decimals':       { iconBg: '#0C8482', iconFg: '#fff', tint: '#E2FAFA', bar: '#086766' },
  'Ratios':         { iconBg: '#D31D52', iconFg: '#fff', tint: '#FFEDF2', bar: '#A41441' },
  'Pre-Algebra':    { iconBg: '#570FBE', iconFg: '#fff', tint: '#F2E8FF', bar: '#430893' },
  'Algebra':        { iconBg: '#570FBE', iconFg: '#fff', tint: '#F2E8FF', bar: '#430893' },
  'Functions':      { iconBg: '#0C8482', iconFg: '#fff', tint: '#E2FAFA', bar: '#086766' },
  'Geometry':       { iconBg: '#D8430E', iconFg: '#fff', tint: '#FFF1EA', bar: '#AA340A' },
  'Trigonometry':   { iconBg: '#D8430E', iconFg: '#fff', tint: '#FFF1EA', bar: '#AA340A' },
  'Calculus':       { iconBg: '#5F18D8', iconFg: '#fff', tint: '#F5EDFF', bar: '#4A11AB' },
  'Statistics':     { iconBg: '#D31D52', iconFg: '#fff', tint: '#FFEDF2', bar: '#A41441' },
  'Probability':    { iconBg: '#D31D52', iconFg: '#fff', tint: '#FFEDF2', bar: '#A41441' },
  'Exponents':      { iconBg: '#D69200', iconFg: '#fff', tint: '#FFFAEB', bar: '#A77000' },
  'Measurement':    { iconBg: '#0C8482', iconFg: '#fff', tint: '#E2FAFA', bar: '#086766' },
  'Logic':          { iconBg: '#570FBE', iconFg: '#fff', tint: '#F2E8FF', bar: '#430893' },
};

const MODULE_ICONS: Record<string, string> = {
  'Number Sense': '🔢', 'Counting': '🔢', 'Addition': '➕', 'Subtraction': '➖',
  'Multiplication': '✖️', 'Division': '➗', 'Arithmetic': '🔢', 'Number Theory': '🔢',
  'Fractions': '🥧', 'Decimals': '💯', 'Ratios': '📊', 'Pre-Algebra': '🔤',
  'Algebra': '🔤', 'Functions': '📈', 'Geometry': '📐', 'Trigonometry': '📐',
  'Calculus': '∫', 'Statistics': '📊', 'Probability': '🎲', 'Exponents': '⚡',
  'Measurement': '📏', 'Logic': '🧩',
};

const STORAGE_MODULE_KEY = 'mwp-practice-module';

export function ModuleView({
  skills,
  mastery,
  selected,
  onToggle,
  onSelectAllInModule,
  initialModule,
}: ModuleViewProps) {
  const modules = React.useMemo(() => distinctModules(skills), [skills]);

  // Pick which module is currently active. Priority:
  //   1. Caller-provided initialModule (if it exists in the catalog)
  //   2. Module persisted in localStorage from a previous session
  //   3. Module with the highest aggregate mastery (so users land on
  //      something they recognize)
  //   4. First module alphabetically
  const [activeModule, setActiveModule] = React.useState<string>(() => {
    if (initialModule && modules.includes(initialModule)) return initialModule;
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(STORAGE_MODULE_KEY);
        if (stored && modules.includes(stored)) return stored;
      } catch { /* ignore */ }
    }
    return modules[0] ?? '';
  });

  // Re-pick the active module if the catalog changes and our current
  // pick isn't in it anymore (defensive — shouldn't happen in practice).
  React.useEffect(() => {
    if (modules.length === 0) return;
    if (!modules.includes(activeModule)) {
      setActiveModule(modules[0]!);
    }
  }, [modules, activeModule]);

  const setModule = React.useCallback((m: string) => {
    setActiveModule(m);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_MODULE_KEY, m);
      }
    } catch { /* ignore */ }
  }, []);

  // Skills filtered to the active module.
  const moduleSkills = React.useMemo(
    () => skills.filter((s) => s.module === activeModule),
    [skills, activeModule],
  );

  // Per-module mastery summaries (for the pills' "78%" display).
  const moduleMasteryByName = React.useMemo(() => {
    const m: Record<string, ReturnType<typeof moduleProgress>> = {};
    for (const name of modules) {
      m[name] = moduleProgress(skills.filter((s) => s.module === name), mastery);
    }
    return m;
  }, [modules, skills, mastery]);

  const groups = React.useMemo(
    () => groupSkillsByGradeAndDifficulty(moduleSkills),
    [moduleSkills],
  );

  const theme = MODULE_THEMES[activeModule] ?? DEFAULT_MODULE_THEME;
  const moduleIcon = MODULE_ICONS[activeModule] ?? '📘';
  const moduleStats = moduleMasteryByName[activeModule] ?? {
    mastery: 0, touchedCount: 0, totalCount: 0,
  };

  const allInModuleSelected = moduleSkills.length > 0 &&
    moduleSkills.every((s) => selected.has(s.id));

  return (
    <div className="space-y-5">
      {/* ── Module picker pills ──────────────────────────────────── */}
      <div>
        <div className="text-2xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
          Choose a module
        </div>
        <div className="flex flex-wrap gap-2">
          {modules.map((m) => {
            const isActive = m === activeModule;
            const t = MODULE_THEMES[m] ?? DEFAULT_MODULE_THEME;
            const stats = moduleMasteryByName[m] ?? { mastery: 0, touchedCount: 0, totalCount: 0 };
            const pct = Math.round(stats.mastery * 100);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setModule(m)}
                aria-pressed={isActive}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1',
                  'text-xs font-semibold transition-all border-2',
                  isActive
                    ? 'text-white shadow-sm scale-[1.02]'
                    : 'text-ink-700 bg-white border-ink-100 hover:border-ink-200',
                )}
                style={isActive ? { background: t.iconBg, borderColor: t.iconBg } : undefined}
              >
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                  style={isActive
                    ? { background: 'rgba(255,255,255,0.22)' }
                    : { background: t.tint, color: t.bar }}
                  aria-hidden
                >
                  <span style={{ fontSize: 12 }}>{MODULE_ICONS[m] ?? '📘'}</span>
                </span>
                <span>{m}</span>
                {pct > 0 && (
                  <span className={cn(
                    'text-2xs font-normal',
                    isActive ? 'opacity-90' : 'text-ink-400',
                  )}>· {pct}%</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active module header ─────────────────────────────────── */}
      <div
        className="flex items-end justify-between gap-3 pb-3 rounded-xl px-3 pt-3 border-l-4"
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
            <h3 className="font-display font-bold text-xl sm:text-2xl text-ink-900 leading-tight truncate">
              {activeModule}
            </h3>
            <div className="text-xs text-ink-500">
              {moduleStats.totalCount} skill{moduleStats.totalCount === 1 ? '' : 's'}
              {moduleStats.touchedCount > 0 && (
                <> · <span className="font-semibold" style={{ color: theme.bar }}>
                  {Math.round(moduleStats.mastery * 100)}% mastered
                </span></>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelectAllInModule(moduleSkills.map((s) => s.id), allInModuleSelected)}
          className={cn(
            'shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border-2 transition-colors bg-white/70',
          )}
          style={
            allInModuleSelected
              ? { borderColor: theme.bar, color: theme.bar, background: theme.tint }
              : { borderColor: '#E5E7EB', color: '#374151' }
          }
        >
          {allInModuleSelected ? '☑ All selected' : 'Select all'}
        </button>
      </div>

      {/* ── Skill list grouped by (gradeBand, difficulty) ─────────── */}
      {groups.length === 0 ? (
        <div className="text-center py-6 text-ink-500 text-sm">
          No skills in this module yet.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={`${g.gradeBand}|${g.difficulty}`}>
              <div className="text-2xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                {g.gradeBand} grade · difficulty {g.difficulty}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {g.skills.map((s) => (
                  <SkillRow
                    key={s.id}
                    skill={s}
                    selected={selected.has(s.id)}
                    masteryInfo={mastery[s.id]}
                    unmet={unmetPrerequisites(s, mastery)}
                    allSkillsById={skills}
                    onClick={() => onToggle(s.id)}
                    accent={theme.bar}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SkillRow ──────────────────────────────────────────────────────────

interface SkillRowProps {
  skill: Skill;
  selected: boolean;
  masteryInfo?: MasteryInfo;
  unmet: string[];
  /** Full skill catalog so we can look up prereq names for the tooltip. */
  allSkillsById: Skill[];
  onClick: () => void;
  accent: string;
}

function SkillRow({
  skill,
  selected,
  masteryInfo,
  unmet,
  allSkillsById,
  onClick,
  accent,
}: SkillRowProps) {
  const masteryPct = masteryInfo && masteryInfo.attempts > 0
    ? Math.round(masteryInfo.mastery * 100)
    : null;
  const masteryLabel = masteryInfo && masteryInfo.attempts > 0
    ? labelFor(masteryInfo.mastery)
    : 'Not started';

  const unmetNames = unmet.map((id) => {
    const s = allSkillsById.find((x) => x.id === id);
    return s ? s.name : id;
  });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all',
        selected
          ? 'border-2 bg-white'
          : 'border-ink-100 hover:border-ink-200 bg-white',
      )}
      style={selected ? { borderColor: accent } : undefined}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-md text-[10px] shrink-0',
          selected ? 'text-white' : 'bg-ink-100 text-ink-400',
        )}
        style={selected ? { background: accent } : undefined}
        aria-hidden
      >
        {selected ? '✓' : ''}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-ink-900 leading-tight truncate">
          {skill.name}
        </div>
        {masteryPct !== null && (
          <div className="text-2xs text-ink-500 mt-0.5">
            {masteryLabel} · {masteryPct}%
          </div>
        )}
      </div>
      {unmet.length > 0 && (
        <Tooltip
          triggerLabel="Prerequisite warning"
          content={
            <div>
              <div className="font-semibold mb-1">Heads up — missing prereqs</div>
              <div className="opacity-90">
                You haven&apos;t mastered yet:
              </div>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                {unmetNames.map((n) => <li key={n}>{n}</li>)}
              </ul>
              <div className="opacity-80 mt-2">
                You can still practice — the difficulty will adapt.
              </div>
            </div>
          }
        >
          <span
            className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-spell-100 text-spell-700 text-[11px] shrink-0"
            aria-hidden
          >
            !
          </span>
        </Tooltip>
      )}
      <DifficultyDots level={skill.intrinsicDifficulty} />
    </button>
  );
}

function DifficultyDots({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0" aria-label={`Difficulty ${level} of 5`}>
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

function labelFor(m: number): string {
  if (m < 0.2) return 'Just started';
  if (m < 0.4) return 'Learning';
  if (m < 0.7) return 'Familiar';
  if (m < 0.9) return 'Solid';
  return 'Mastered';
}
