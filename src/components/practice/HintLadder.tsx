'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MathRender } from '@/components/math/MathRender';
import type { Hint } from '@/types/core';

/**
 * Three-tier progressive hint ladder.
 *
 * Behaviour:
 *  - Click "Need a hint?" → reveal hint level 1.
 *  - Click "More help" → reveal level 2 (and so on).
 *  - Each new hint stays visible (the student can re-read) but the count
 *    affects the XP penalty server-side.
 *  - We never show level 3 without an explicit click — the student has to
 *    decide they want a near-final nudge.
 */

export interface HintLadderProps {
  hints: [Hint, Hint, Hint];
  onHintRevealed: (count: number) => void;
}

const LEVEL_LABELS = ['Concept hint', 'Strategy hint', 'Almost-there hint'];
const LEVEL_TONES: Array<'subtle' | 'medium' | 'strong'> = ['subtle', 'medium', 'strong'];

export function HintLadder({ hints, onHintRevealed }: HintLadderProps) {
  const [revealed, setRevealed] = React.useState(0);

  const reveal = () => {
    if (revealed >= 3) return;
    const next = revealed + 1;
    setRevealed(next);
    onHintRevealed(next);
  };

  return (
    <div className="space-y-2">
      {Array.from({ length: revealed }).map((_, i) => {
        const hint = hints[i];
        if (!hint) return null;
        const tone = LEVEL_TONES[i];
        return (
          <div
            key={i}
            className={cn(
              'rounded-xl border px-4 py-3 text-sm animate-slide-down',
              tone === 'subtle' && 'border-spell-200 bg-spell-50 text-spell-900',
              tone === 'medium' && 'border-spell-300 bg-spell-100 text-spell-900',
              tone === 'strong' && 'border-spell-400 bg-spell-200 text-spell-900',
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{i === 0 ? '💡' : i === 1 ? '🧭' : '🔎'}</span>
              <span className="font-display text-2xs uppercase tracking-wider font-bold">
                {LEVEL_LABELS[i]}
              </span>
            </div>
            <MathRender>{hint.text}</MathRender>
          </div>
        );
      })}

      {revealed < 3 && (
        <button
          type="button"
          onClick={reveal}
          className={cn(
            'inline-flex items-center gap-2 text-sm font-semibold',
            'text-wizard-600 hover:text-wizard-700 transition-colors',
          )}
        >
          <span aria-hidden>{revealed === 0 ? '💡' : revealed === 1 ? '🧭' : '🔎'}</span>
          {revealed === 0 ? 'Need a hint?' : revealed === 1 ? 'More help, please' : 'One last nudge'}
        </button>
      )}
    </div>
  );
}
