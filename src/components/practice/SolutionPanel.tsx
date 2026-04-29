'use client';

import * as React from 'react';
import { MathRender } from '@/components/math/MathRender';
import type { SolutionStep } from '@/types/core';

/**
 * Step-by-step worked solution shown after a wrong answer (or on demand).
 * Each step renders with KaTeX and a subtle staircase visual.
 */
export interface SolutionPanelProps {
  steps: SolutionStep[];
}

export function SolutionPanel({ steps }: SolutionPanelProps) {
  return (
    <ol className="rounded-2xl bg-leaf-50 border border-leaf-200 p-4 space-y-3 animate-slide-down">
      <li className="flex items-center gap-2 text-leaf-800">
        <span className="text-lg">📖</span>
        <span className="font-display font-bold text-sm uppercase tracking-wide">
          Step-by-step solution
        </span>
      </li>
      {steps.map((step, i) => (
        <li key={i} className="relative pl-8">
          <span
            className="absolute left-0 top-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-leaf-500 text-white text-xs font-bold"
            aria-hidden
          >
            {i + 1}
          </span>
          <div className="font-semibold text-leaf-900 text-sm">
            <MathRender>{step.title}</MathRender>
          </div>
          <div className="text-sm text-leaf-800 mt-1">
            <MathRender>{step.detail}</MathRender>
          </div>
          {step.state ? (
            <div className="mt-2 inline-block rounded-md bg-white border border-leaf-200 px-3 py-1 font-mono text-sm text-leaf-900">
              <MathRender>{step.state}</MathRender>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
