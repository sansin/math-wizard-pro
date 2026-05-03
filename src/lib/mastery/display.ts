/**
 * Shared mastery-display helpers used by BOTH the "by grade" and
 * "by module" practice picker views. Single source of truth so the two
 * views can never drift apart on:
 *
 *   - threshold labels ("Familiar", "Solid", etc.)
 *   - background-fill style for skill rows
 *   - what counts as "touched" (attempts > 0)
 *
 * If you change a threshold here, both views update at once.
 */

import type * as React from 'react';

/**
 * Mastery thresholds. These must match the Beta(2,2)-prior calibration
 * so the labels feel right at every point on the curve. See the
 * migration `20260504000001_mastery_prior_fix.sql` for the math behind
 * the trigger that produces these mastery values.
 */
export const MASTERY_THRESHOLDS = {
  JUST_STARTED: 0.20,  // [0, 0.20)
  LEARNING:     0.40,  // [0.20, 0.40)
  FAMILIAR:     0.70,  // [0.40, 0.70)
  SOLID:        0.90,  // [0.70, 0.90)
  // [0.90, 1.0]       Mastered
} as const;

export type MasteryLabel =
  | 'Just started'
  | 'Learning'
  | 'Familiar'
  | 'Solid'
  | 'Mastered';

/**
 * Human-readable label for a 0..1 mastery value. Boundary values fall
 * into the LOWER bracket (e.g., exactly 0.40 = "Familiar", not "Learning")
 * so users at the edge see the label they've earned.
 */
export function masteryLabel(mastery: number): MasteryLabel {
  if (mastery < MASTERY_THRESHOLDS.JUST_STARTED) return 'Just started';
  if (mastery < MASTERY_THRESHOLDS.LEARNING)     return 'Learning';
  if (mastery < MASTERY_THRESHOLDS.FAMILIAR)     return 'Familiar';
  if (mastery < MASTERY_THRESHOLDS.SOLID)        return 'Solid';
  return 'Mastered';
}

/** Minimal mastery info shape — matches what /api/skills?withMastery=1
 *  returns per skill. Tests use this same shape. */
export interface MasterySnapshot {
  mastery: number;
  attempts: number;
}

/**
 * Inline `style` object for a skill row whose background should fill
 * left-to-right by mastery. Used in both views so the visual feedback
 * is identical wherever a skill row is rendered.
 *
 * Color logic:
 *   - low mastery (0–30%):  pale ember (warm red)
 *   - mid mastery (30–70%): pale gold
 *   - high mastery (70%+):  pale leaf (green)
 *
 * The unfilled portion is white when unselected, wizard-50 when
 * selected, so selection state still reads clearly through the gradient.
 *
 * Returns `undefined` (no style) when the skill has zero attempts —
 * untouched skills get a clean white/selected background, no fill.
 */
export function masteryBackgroundStyle(
  m: MasterySnapshot | undefined,
  selected: boolean,
): React.CSSProperties | undefined {
  if (!m || m.attempts === 0) {
    return selected
      ? { background: '#F4F0FF' /* wizard-50 */ }
      : { background: '#FFFFFF' };
  }
  const pct = Math.max(2, Math.min(100, Math.round(m.mastery * 100)));
  const fill =
    m.mastery < 0.3 ? '#FFE3DC'   // ember-ish
    : m.mastery < 0.7 ? '#FFEEC2' // spell-ish
    :                   '#D4F2DD'; // leaf-ish
  const rest = selected ? '#F4F0FF' : '#FFFFFF';
  return {
    background: `linear-gradient(to right, ${fill} 0%, ${fill} ${pct}%, ${rest} ${pct}%, ${rest} 100%)`,
  };
}

/**
 * Returns the displayable percentage (0–100, integer) for a mastery
 * snapshot, or `null` when the skill is untouched (so the caller can
 * hide the `· N%` chip rather than show "0%").
 */
export function masteryPercent(m: MasterySnapshot | undefined): number | null {
  if (!m || m.attempts === 0) return null;
  return Math.round(m.mastery * 100);
}

/** True when the skill has been practiced at least once. */
export function isTouched(m: MasterySnapshot | undefined): boolean {
  return !!m && m.attempts > 0;
}
