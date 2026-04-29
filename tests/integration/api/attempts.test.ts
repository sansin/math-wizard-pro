/**
 * Integration test for /api/attempts route handler logic.
 * We exercise the parser + checker + XP path; Supabase is mocked.
 */

import { describe, it, expect } from 'vitest';
import { parseUserAnswer } from '@/lib/math/parser';
import { checkAnswer } from '@/lib/math/checker';
import { calculateXP } from '@/lib/mastery/xp';

describe('attempt evaluation pipeline', () => {
  it('grants XP for correct numeric answer', () => {
    const parsed = parseUserAnswer('42');
    const result = checkAnswer(parsed, { type: 'numeric', value: 42 });
    expect(result.correct).toBe(true);
    const xp = calculateXP({ correct: true, difficulty: 3, streak: 2, hintsUsed: 0 });
    expect(xp).toBeGreaterThan(0);
  });

  it('grants 0 XP for wrong answer', () => {
    const parsed = parseUserAnswer('41');
    const result = checkAnswer(parsed, { type: 'numeric', value: 42 });
    expect(result.correct).toBe(false);
    const xp = calculateXP({ correct: false, difficulty: 3, streak: 2, hintsUsed: 0 });
    expect(xp).toBe(0);
  });

  it('penalizes XP based on hints used (when correct)', () => {
    const xp0 = calculateXP({ correct: true, difficulty: 3, streak: 0, hintsUsed: 0 });
    const xp1 = calculateXP({ correct: true, difficulty: 3, streak: 0, hintsUsed: 1 });
    const xp2 = calculateXP({ correct: true, difficulty: 3, streak: 0, hintsUsed: 2 });
    expect(xp0).toBeGreaterThan(xp1);
    expect(xp1).toBeGreaterThan(xp2);
  });

  it('rewards streaks (within cap)', () => {
    const xp0 = calculateXP({ correct: true, difficulty: 3, streak: 0, hintsUsed: 0 });
    const xp5 = calculateXP({ correct: true, difficulty: 3, streak: 5, hintsUsed: 0 });
    const xp50 = calculateXP({ correct: true, difficulty: 3, streak: 50, hintsUsed: 0 });
    expect(xp5).toBeGreaterThan(xp0);
    expect(xp50).toBe(xp5 + (Math.min(50 * 2, 20) - Math.min(5 * 2, 20)));
  });

  it('treats fractions and decimals as equivalent', () => {
    expect(checkAnswer(parseUserAnswer('1/2'), { type: 'numeric', value: 0.5 }).correct).toBe(true);
    expect(checkAnswer(parseUserAnswer('0.5'), { type: 'fraction', numerator: 1, denominator: 2 }).correct).toBe(true);
  });
});
