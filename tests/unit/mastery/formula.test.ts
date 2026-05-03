import { describe, it, expect } from 'vitest';
import {
  ATTEMPT_DECAY,
  PRIOR_MASTERY,
  PRIOR_STRENGTH,
  applyAttempt,
  replayAttempts,
} from '@/lib/mastery/formula';
import { masteryLabel } from '@/lib/mastery/display';

describe('mastery formula constants', () => {
  it('uses Beta(2,2) prior — 0.5 expected mastery, strength of 4', () => {
    expect(PRIOR_MASTERY).toBe(0.5);
    expect(PRIOR_STRENGTH).toBe(4);
  });

  it('decays per-attempt weight by 0.10', () => {
    expect(ATTEMPT_DECAY).toBe(0.10);
  });
});

describe('applyAttempt — single update', () => {
  it('cold start + 1 correct → 0.625, NOT 1.0 (the bug we fixed)', () => {
    const r = applyAttempt({ prevMastery: null, prevAttempts: 0, correct: true });
    // 0.5 + (1 - 0.5) * (1/4) = 0.625
    expect(r.mastery).toBeCloseTo(0.625, 5);
    expect(r.attempts).toBe(1);
    expect(r.weight).toBeCloseTo(0.25, 5);
  });

  it('cold start + 1 wrong → 0.375 (symmetric to one correct)', () => {
    const r = applyAttempt({ prevMastery: null, prevAttempts: 0, correct: false });
    // 0.5 + (0 - 0.5) * (1/4) = 0.375
    expect(r.mastery).toBeCloseTo(0.375, 5);
  });

  it('clamps mastery to [0, 1]', () => {
    // Even if curr_mastery was somehow above 1.0 (shouldn't happen),
    // we clamp the output.
    const r = applyAttempt({ prevMastery: 1.5, prevAttempts: 0, correct: true });
    expect(r.mastery).toBeLessThanOrEqual(1);
  });

  it('weight diminishes as attempts accumulate', () => {
    const r0 = applyAttempt({ prevMastery: 0.5, prevAttempts: 0, correct: true });
    const r10 = applyAttempt({ prevMastery: 0.5, prevAttempts: 10, correct: true });
    const r100 = applyAttempt({ prevMastery: 0.5, prevAttempts: 100, correct: true });
    expect(r0.weight).toBeGreaterThan(r10.weight);
    expect(r10.weight).toBeGreaterThan(r100.weight);
  });
});

describe('replayAttempts — calibration table', () => {
  // Each row in this table is part of the spec for the formula. If a
  // change makes any of these numbers worse than current, that's a
  // breaking calibration regression.
  //
  // Numbers come from running the formula directly — see the comments
  // in src/lib/mastery/formula.ts. They were re-verified against a
  // freshly-traced computation, not back-of-the-envelope guesses.
  const CALIBRATION = [
    // [description,                        sequence,                         expectedMastery, expectedLabel]
    ['1 correct',                            [true],                                              0.625, 'Familiar'],
    ['2 correct in a row',                   [true, true],                                        0.717, 'Solid'],
    ['5 correct in a row',                   Array(5).fill(true),                                 0.872, 'Solid'],
    ['10 correct in a row',                  Array(10).fill(true),                                0.961, 'Mastered'],
    ['20 correct in a row',                  Array(20).fill(true),                                0.995, 'Mastered'],
    ['1 wrong',                              [false],                                             0.375, 'Learning'],
    ['5 wrong in a row',                     Array(5).fill(false),                                0.128, 'Just started'],
    ['1 right + 1 wrong',                    [true, false],                                       0.473, 'Familiar'],
    ['1 wrong + 1 right',                    [false, true],                                       0.527, 'Familiar'],
  ] as const;

  for (const [desc, seq, expectedMastery, expectedLabel] of CALIBRATION) {
    it(`${desc} → mastery ≈ ${expectedMastery}, label "${expectedLabel}"`, () => {
      const r = replayAttempts(seq as boolean[]);
      // Tolerance of 0.005 — formula is fully deterministic so the only
      // float drift comes from accumulated rounding. Tightening this
      // would catch math regressions but flap on legitimate constant
      // changes; loosening would let wrong answers slip through.
      expect(r.mastery).toBeCloseTo(expectedMastery, 2);
      expect(masteryLabel(r.mastery)).toBe(expectedLabel);
    });
  }
});

describe('replayAttempts — recency matters (the user-asked question)', () => {
  // The user explicitly asked: how do these two scenarios compare?
  //   1) 25/30 correct, wrongs scattered evenly
  //   2) 25/30 correct, but the most recent 20 are all correct
  //
  // The EMA formula naturally weights recent attempts more, so
  // scenario 2 should land notably higher than scenario 1.

  function scattered25of30(): boolean[] {
    // 25 correct, 5 wrong — wrongs at every 6th position roughly
    const seq: boolean[] = [];
    for (let i = 0; i < 30; i++) seq.push(i % 6 !== 0);
    // ensure exactly 25 right / 5 wrong
    return seq;
  }

  function streakAtTheEnd(): boolean[] {
    // First 10 attempts: 5 right + 5 wrong alternating (settled state ~ 0.5)
    // Then 20 correct in a row.
    const head: boolean[] = [];
    for (let i = 0; i < 10; i++) head.push(i % 2 === 0);
    const tail = Array(20).fill(true);
    return [...head, ...tail];
  }

  it('scenario 1 (scattered) lands in the upper-Solid range (~0.89)', () => {
    const r = replayAttempts(scattered25of30());
    // Actual ~0.89 — the recent few attempts in the sequence are
    // all correct (i=25..29 are all true since 25,26,27,28,29 mod 6 != 0),
    // pushing the EMA toward 1.0. Still BELOW 0.90 — never quite
    // reaches Mastered because the wrongs scattered through the
    // history keep biting.
    expect(r.mastery).toBeGreaterThan(0.80);
    expect(r.mastery).toBeLessThan(0.90);
  });

  it('scenario 2 (recent streak) lands deep in the Mastered range (~0.99)', () => {
    const r = replayAttempts(streakAtTheEnd());
    // Actual ~0.99 — the 20-attempt streak after the early noise
    // saturates the EMA close to 1.0.
    expect(r.mastery).toBeGreaterThan(0.95);
  });

  it('scenario 2 reads notably higher than scenario 1', () => {
    const m1 = replayAttempts(scattered25of30()).mastery;
    const m2 = replayAttempts(streakAtTheEnd()).mastery;
    expect(m2).toBeGreaterThan(m1);
    // Concrete gap: at least 5 percentage points
    expect(m2 - m1).toBeGreaterThan(0.05);
  });
});

describe('replayAttempts — recovery from a bad start', () => {
  it('5 wrong then 25 right → ends in Mastered (learned the skill)', () => {
    const seq = [...Array(5).fill(false), ...Array(25).fill(true)];
    const r = replayAttempts(seq);
    expect(masteryLabel(r.mastery)).toBe('Mastered');
  });

  it('25 right then 5 wrong → drops out of Mastered (regression detected)', () => {
    const seq = [...Array(25).fill(true), ...Array(5).fill(false)];
    const r = replayAttempts(seq);
    expect(masteryLabel(r.mastery)).not.toBe('Mastered');
  });
});
