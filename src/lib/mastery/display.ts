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

/**
 * Minimum attempts required to qualify for higher-confidence labels.
 * The mastery NUMBER is unchanged — these only gate the label so we
 * don't tell a user "Mastered" after 1 lucky correct answer or
 * "Solid" after 3.
 *
 * Without these floors, mastery=0.95 with 2 attempts looks the same
 * as mastery=0.95 with 30 attempts. With them, the under-evidence
 * row shows "Familiar (95%)" — the percentage still rewards the
 * good run, but the label doesn't make a confidence claim we can't
 * back up.
 */
export const MIN_ATTEMPTS_FOR_LABEL = {
  SOLID:    10,  // need ≥10 attempts to be called Solid
  MASTERED: 15,  // need ≥15 attempts to be called Mastered
} as const;

export type MasteryLabel =
  | 'Just started'
  | 'Learning'
  | 'Familiar'
  | 'Solid'
  | 'Mastered';

/**
 * Human-readable label for a 0..1 mastery value. Boundary values fall
 * into the LOWER bracket (e.g., exactly 0.40 = "Familiar", not
 * "Learning") so users at the edge see the label they've earned.
 *
 * Higher labels are gated by minimum attempt counts to prevent
 * lucky-streak inflation. If `attempts` is omitted, the floors don't
 * apply (callers can pass nothing in display contexts that don't have
 * attempt info — e.g., aggregate module mastery).
 */
export function masteryLabel(mastery: number, attempts?: number): MasteryLabel {
  if (mastery < MASTERY_THRESHOLDS.JUST_STARTED) return 'Just started';
  if (mastery < MASTERY_THRESHOLDS.LEARNING)     return 'Learning';
  if (mastery < MASTERY_THRESHOLDS.FAMILIAR)     return 'Familiar';

  // Solid floor — if mastery has reached the Solid threshold but the
  // user hasn't put in enough attempts to credibly claim it, cap at
  // Familiar. Same idea for Mastered → Solid below.
  if (mastery < MASTERY_THRESHOLDS.SOLID) {
    if (attempts !== undefined && attempts < MIN_ATTEMPTS_FOR_LABEL.SOLID) return 'Familiar';
    return 'Solid';
  }

  // Mastered floor — needs both >= 0.90 mastery AND >= 15 attempts.
  // If only the mastery is high but attempts are thin, drop one
  // tier (to Solid) — and apply the Solid floor on top, so we don't
  // skip past it for a 1-attempt 0.95 row.
  if (attempts !== undefined && attempts < MIN_ATTEMPTS_FOR_LABEL.MASTERED) {
    if (attempts < MIN_ATTEMPTS_FOR_LABEL.SOLID) return 'Familiar';
    return 'Solid';
  }
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
