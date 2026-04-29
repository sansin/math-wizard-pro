'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Wizard mascot — a crisp SVG illustration that scales perfectly and
 * renders identically across platforms (unlike the 🧙 emoji used in v1).
 *
 * Modes:
 *   - 'idle'      — gentle floating animation
 *   - 'thinking'  — head tilted, sparkle around hat
 *   - 'happy'     — eyes squinted, smile, bigger sparkles
 *   - 'oops'      — concerned expression
 */

export type WizardMood = 'idle' | 'thinking' | 'happy' | 'oops';

export interface WizardProps {
  mood?: WizardMood;
  size?: number;
  className?: string;
  animated?: boolean;
}

export function Wizard({ mood = 'idle', size = 120, className, animated = true }: WizardProps) {
  const eyeY = mood === 'happy' ? 73 : 70;
  const mouth =
    mood === 'happy'  ? 'M 56 86 Q 64 96 72 86' :
    mood === 'oops'   ? 'M 56 88 Q 64 80 72 88' :
                        'M 58 87 Q 64 92 70 87';
  const eyeShape = mood === 'happy'
    ? <>
        <path d="M 53 71 Q 56 67 59 71" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 69 71 Q 72 67 75 71" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    : <>
        <circle cx="56" cy={eyeY} r="2.2" fill="#1F2937" />
        <circle cx="72" cy={eyeY} r="2.2" fill="#1F2937" />
      </>;

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={cn(animated && mood === 'idle' ? 'animate-wizard-float' : '', className)}
      aria-hidden="true"
      role="img"
    >
      <defs>
        <linearGradient id="hatGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7C4DFF" />
          <stop offset="1" stopColor="#421A8F" />
        </linearGradient>
        <linearGradient id="robeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9870FF" />
          <stop offset="1" stopColor="#5524BB" />
        </linearGradient>
        <radialGradient id="moonGrad" cx="0.3" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#FFAA00" />
        </radialGradient>
      </defs>

      {/* Glow */}
      <circle cx="64" cy="64" r="56" fill="#7C4DFF" opacity="0.06" />

      {/* Stars on hat */}
      <g opacity={mood === 'thinking' || mood === 'happy' ? 1 : 0.6}>
        <path d="M 30 18 l 1.5 3 3 .4 -2 2.2 .6 3.2 -3-1.6 -3 1.6 .6-3.2 -2-2.2 3-.4 z" fill="#FFE08A" className={animated ? 'animate-sparkle' : ''} />
        <path d="M 100 28 l 1.2 2.4 2.4 .3 -1.6 1.8 .5 2.6 -2.5-1.3 -2.5 1.3 .5-2.6 -1.6-1.8 2.4-.3 z" fill="#FFE08A" className={animated ? 'animate-sparkle' : ''} style={{ animationDelay: '0.4s' }} />
      </g>

      {/* Hat */}
      <path
        d="M 64 6 L 28 60 L 100 60 Z"
        fill="url(#hatGrad)"
      />
      <ellipse cx="64" cy="60" rx="38" ry="6" fill="#421A8F" />
      <path d="M 64 6 L 64 60" stroke="#5524BB" strokeWidth="1" opacity="0.4" />

      {/* Hat band w/ moon emblem */}
      <rect x="36" y="50" width="56" height="8" rx="2" fill="#22223A" />
      <circle cx="64" cy="54" r="3.4" fill="url(#moonGrad)" />
      <path d="M 65 53.2 a 2.5 2.5 0 1 0 0 1.6" fill="#22223A" />

      {/* Face */}
      <ellipse cx="64" cy="78" rx="20" ry="18" fill="#FFE0CC" />
      <ellipse cx="64" cy="78" rx="20" ry="18" fill="none" stroke="#E8C9B0" strokeWidth="0.5" />

      {/* Beard */}
      <path d="M 44 80 Q 48 110 64 110 Q 80 110 84 80 Q 76 96 64 96 Q 52 96 44 80 Z" fill="#F7F7FB" stroke="#D8D8E5" strokeWidth="0.5" />

      {/* Mustache */}
      <path d="M 52 88 Q 58 92 64 90 Q 70 92 76 88 Q 70 95 64 94 Q 58 95 52 88 Z" fill="#F7F7FB" />

      {/* Eyes / mouth */}
      {eyeShape}
      <path d={mouth} stroke="#1F2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />

      {/* Robe collar peeking out */}
      <path d="M 36 110 Q 64 124 92 110 L 92 124 L 36 124 Z" fill="url(#robeGrad)" />
    </svg>
  );
}
