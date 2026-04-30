'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Wizard } from '@/components/Wizard';
import { formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Session-end highlights popup.
 *
 * Shows four outcome buckets per question:
 *   firstTry  - got it right on attempt 1
 *   retried   - got it right after a wrong attempt
 *   sawSolution - clicked "See solution" (gave up, learned)
 *   skipped   - clicked "Skip"
 *
 * Headline accuracy is FIRST-TRY accuracy (firstTry / total) — that's the
 * mastery measure. We also show "got there eventually" rate so persistence
 * is rewarded but not conflated with mastery.
 */

export interface SessionEndSummaryProps {
  open: boolean;
  /** "Keep practicing" / dismiss — just close the modal, stay on the screen. */
  onKeepPracticing: () => void;
  /** "Back to modules" — close AND unmount the practice screen. */
  onLeave: () => void;
  /** Practice or Test mode — slightly different framing per mode. */
  mode: 'practice' | 'test';

  firstTry: number;
  retried: number;
  sawSolution: number;
  skipped: number;
  totalQuestions: number;
  xpEarned: number;
  bestStreak: number;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** skill_id → count answered correctly. */
  skillCounts: Record<string, number>;
  /** Optional skill-id → human name lookup, so we can label the top skill. */
  skillNames?: Record<string, string>;
}

export function SessionEndSummary(p: SessionEndSummaryProps) {
  const correctAny = p.firstTry + p.retried;
  const firstTryPct = p.totalQuestions > 0
    ? Math.round((p.firstTry / p.totalQuestions) * 100)
    : 0;
  const eventuallyPct = p.totalQuestions > 0
    ? Math.round((correctAny / p.totalQuestions) * 100)
    : 0;

  const topSkillId = React.useMemo(() => {
    const entries = Object.entries(p.skillCounts);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]![0];
  }, [p.skillCounts]);

  const headline = (() => {
    if (p.totalQuestions === 0) return 'Session ended';
    if (firstTryPct >= 90 && p.totalQuestions >= 5) return 'Wizard-level work! 🌟';
    if (firstTryPct >= 75) return 'Strong session 💪';
    if (firstTryPct >= 50) return 'Solid practice 👍';
    return 'Keep going — every attempt counts 💜';
  })();

  const takeaways: string[] = [];
  if (p.bestStreak >= 5) takeaways.push(`Best streak: ${p.bestStreak} in a row 🔥`);
  if (topSkillId && p.skillCounts[topSkillId]! >= 2) {
    const name = p.skillNames?.[topSkillId] ?? topSkillId;
    takeaways.push(`Most practiced: ${name}`);
  }
  if (p.retried > 0) {
    takeaways.push(`Persistence pays — ${p.retried} ${p.retried === 1 ? 'question' : 'questions'} solved after a retry`);
  }
  if (p.sawSolution > 0 || p.skipped > 0) {
    const tough = p.sawSolution + p.skipped;
    takeaways.push(`${tough} tough one${tough === 1 ? '' : 's'} to revisit later`);
  }
  if (p.xpEarned >= 50) takeaways.push(`+${p.xpEarned} XP earned`);

  return (
    <Modal open={p.open} onClose={p.onKeepPracticing} title="Session highlights" size="md">
      <div className="px-6 pb-6 pt-2 space-y-5">
        <div className="flex items-center gap-4">
          <Wizard mood="happy" size={68} />
          <div>
            <h3 className="font-display font-bold text-xl text-ink-900">{headline}</h3>
            <p className="text-sm text-ink-600">
              {p.mode === 'test' ? 'Test mode' : 'Practice'} · {formatDuration(p.durationMs)} on the clock
            </p>
          </div>
        </div>

        {/* Outcome breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="First-try" value={String(p.firstTry)} accent="leaf" />
          <Stat label="After retry" value={String(p.retried)} accent="spell" />
          <Stat label="Saw solution" value={String(p.sawSolution)} accent="ember" />
          <Stat label="Skipped" value={String(p.skipped)} accent="ink" />
        </div>

        {/* Headline accuracy block */}
        <div className="rounded-xl bg-leaf-50 border border-leaf-200 p-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="text-2xs uppercase tracking-wider font-bold text-leaf-700">
                First-try accuracy
              </div>
              <div className="font-display font-bold text-3xl text-leaf-900 leading-tight">
                {firstTryPct}%
              </div>
              <div className="text-xs text-leaf-700 mt-0.5">
                {p.firstTry} of {p.totalQuestions} on the first try
              </div>
            </div>
            {p.retried > 0 && (
              <div className="text-right">
                <div className="text-2xs uppercase tracking-wider font-bold text-spell-700">
                  Got there eventually
                </div>
                <div className="font-display font-bold text-2xl text-spell-800">
                  {eventuallyPct}%
                </div>
                <div className="text-xs text-spell-700 mt-0.5">
                  {correctAny} of {p.totalQuestions} after retries
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-2xs uppercase tracking-wider font-bold text-spell-700">
                XP earned
              </div>
              <div className="font-display font-bold text-2xl text-spell-800">
                +{p.xpEarned}
              </div>
            </div>
          </div>
        </div>

        {/* Takeaways */}
        {takeaways.length > 0 && (
          <div className="rounded-xl bg-wizard-50 border border-wizard-200 p-4 space-y-1">
            <div className="font-display text-2xs uppercase tracking-wider font-bold text-wizard-700">
              Highlights
            </div>
            <ul className="text-sm text-wizard-900 space-y-0.5">
              {takeaways.map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span aria-hidden>✨</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.totalQuestions === 0 && (
          <p className="text-sm text-ink-600 text-center">
            No answers logged this session. Want to keep going?
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={p.onKeepPracticing} className="flex-1">
            ↺ Keep practicing
          </Button>
          <Button variant="primary" onClick={p.onLeave} className="flex-1">
            Back to modules →
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  accent = 'wizard',
}: {
  label: string;
  value: string;
  accent?: 'wizard' | 'leaf' | 'spell' | 'ember' | 'ink';
}) {
  const tones: Record<string, string> = {
    wizard: 'bg-wizard-50 text-wizard-900 border-wizard-100',
    leaf:   'bg-leaf-50 text-leaf-900 border-leaf-100',
    spell:  'bg-spell-50 text-spell-900 border-spell-100',
    ember:  'bg-ember-50 text-ember-900 border-ember-100',
    ink:    'bg-ink-50 text-ink-900 border-ink-100',
  };
  return (
    <div className={cn('rounded-xl border p-3 text-center', tones[accent])}>
      <div className="font-display font-bold text-2xl leading-tight">{value}</div>
      <div className="text-2xs uppercase tracking-wider mt-0.5 opacity-75">{label}</div>
    </div>
  );
}
