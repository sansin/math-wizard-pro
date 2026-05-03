/**
 * Pure-JS port of the mastery EMA formula that lives in the
 * `handle_attempt_insert` Postgres trigger
 * (supabase/migrations/20260504000001_mastery_prior_fix.sql).
 *
 * Why duplicate the formula here?
 *   - The trigger is the SOURCE OF TRUTH for production. It runs in
 *     plpgsql and we can't easily unit-test it from Vitest.
 *   - This pure-JS port lets us pin the math with unit tests so any
 *     accidental drift between the trigger and our intent is caught.
 *
 * If you change the trigger formula, change this file too AND update
 * the tests. The tests document our calibration choices.
 *
 * Formula:
 *   mastery_next = mastery_prev + (target - mastery_prev) * weight
 *
 *   where:
 *     mastery_prev = 0.5 if no prior row, else the stored value
 *     weight       = 1 / (4 + attempts_prev * 0.10)    (Beta(2,2) prior)
 *     target       = 1.0 if correct, else 0.0
 *
 * The 4 in the denominator is the prior strength. With 0 attempts,
 * weight = 0.25, so a single correct answer moves mastery from 0.5
 * to 0.625 instead of 0 → 1.0.
 */

/** Prior expected mastery before any evidence (Beta(2,2) → 0.5). */
export const PRIOR_MASTERY = 0.5;

/** Prior strength in attempts. With 4 prior "attempts" of belief at 50%,
 *  the first real attempt has weight 1/4 = 0.25. */
export const PRIOR_STRENGTH = 4;

/** Per-attempt weight decay. Larger values mean each new attempt has
 *  diminishing influence faster. Matches the trigger's `* 0.10`. */
export const ATTEMPT_DECAY = 0.10;

export interface MasteryUpdateInput {
  /** Previous mastery (0..1), or null when no prior row exists. */
  prevMastery: number | null;
  /** Number of attempts BEFORE this one. */
  prevAttempts: number;
  /** Was this attempt correct? */
  correct: boolean;
}

export interface MasteryUpdateOutput {
  /** New mastery, clamped to [0, 1]. */
  mastery: number;
  /** New attempt count. */
  attempts: number;
  /** The weight that was applied to this update — useful for telemetry. */
  weight: number;
}

/**
 * Compute the next mastery value after one attempt. Pure function.
 * Matches the Postgres trigger 1:1.
 */
export function applyAttempt(input: MasteryUpdateInput): MasteryUpdateOutput {
  const prev = input.prevMastery ?? PRIOR_MASTERY;
  const weight = 1.0 / (PRIOR_STRENGTH + input.prevAttempts * ATTEMPT_DECAY);
  const target = input.correct ? 1.0 : 0.0;
  const next = prev + (target - prev) * weight;
  const clamped = Math.max(0, Math.min(1, next));
  return {
    mastery: clamped,
    attempts: input.prevAttempts + 1,
    weight,
  };
}

/**
 * Replay a sequence of attempts from cold start, returning the final
 * mastery. Useful in tests for asserting "what happens after N rights
 * in a row" or "wrong-then-right" sequences.
 */
export function replayAttempts(corrects: boolean[]): MasteryUpdateOutput {
  let mastery: number | null = null;
  let attempts = 0;
  let weight = 0;
  for (const c of corrects) {
    const r = applyAttempt({ prevMastery: mastery, prevAttempts: attempts, correct: c });
    mastery = r.mastery;
    attempts = r.attempts;
    weight = r.weight;
  }
  return {
    mastery: mastery ?? PRIOR_MASTERY,
    attempts,
    weight,
  };
}
