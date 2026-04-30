'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { AnswerKind } from '@/types/core';

/**
 * Smart answer input that adapts to the expected answer kind.
 * For numeric/fraction: a single text input with hints about valid forms.
 * For multipleChoice: tappable cards.
 *
 * NOTE: We never expose the *correct* answer to the client until after the
 * user submits. The component only receives the *type* and (for MC) the
 * options.
 */

export interface AnswerInputProps {
  expectedType: AnswerKind['type'];
  /** For multiple choice, the options to render. */
  choices?: string[];
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  status?: 'idle' | 'correct' | 'wrong';
  autoFocus?: boolean;
}

export function AnswerInput({
  expectedType,
  choices,
  value,
  onChange,
  onSubmit,
  disabled,
  status = 'idle',
  autoFocus,
}: AnswerInputProps) {
  if (expectedType === 'multipleChoice' && choices) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {choices.map((c, i) => {
          const letter = String.fromCharCode('A'.charCodeAt(0) + i);
          const selected = value === letter;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(letter)}
              onDoubleClick={onSubmit}
              disabled={disabled}
              className={cn(
                'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                selected
                  ? 'border-wizard-500 bg-wizard-50 shadow-wizard'
                  : 'border-ink-200 bg-white hover:border-wizard-300 hover:bg-wizard-50/40',
                disabled && 'opacity-60 cursor-not-allowed',
                status === 'correct' && selected && 'border-leaf-500 bg-leaf-50',
                status === 'wrong' && selected && 'border-ember-500 bg-ember-50',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg font-display font-bold text-sm shrink-0',
                  selected ? 'bg-wizard-500 text-white' : 'bg-ink-100 text-ink-700',
                )}
              >
                {letter}
              </span>
              <span className="text-sm font-medium text-ink-800 pt-1">{c}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const placeholder =
    expectedType === 'fraction' ? 'Enter your answer (e.g. 1/2 or 0.5)' :
    expectedType === 'expression' ? 'Enter your simplified expression (e.g. 6x)' :
    expectedType === 'text' ? 'Type your answer' :
    'Enter your answer';

  return (
    <input
      type="text"
      inputMode={expectedType === 'numeric' || expectedType === 'fraction' ? 'decimal' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit();
      }}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label="Your answer"
      className={cn(
        'h-14 w-full rounded-xl border-2 px-4 text-lg font-mono transition-colors',
        'text-ink-900 placeholder:text-ink-400',
        'focus:outline-none focus:ring-4',
        status === 'correct'
          ? 'border-leaf-500 bg-leaf-50 focus:ring-leaf-200'
          : status === 'wrong'
          ? 'border-ember-500 bg-ember-50 focus:ring-ember-200 animate-shake'
          : 'border-ink-200 bg-white focus:border-wizard-400 focus:ring-wizard-100',
        disabled && 'opacity-60',
      )}
    />
  );
}
