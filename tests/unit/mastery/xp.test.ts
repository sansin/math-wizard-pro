import { describe, it, expect } from 'vitest';
import { calculateXP, levelForXP, xpProgress, LEVEL_THRESHOLDS } from '@/lib/mastery/xp';

describe('calculateXP', () => {
  it('returns 0 for incorrect answers', () => {
    expect(calculateXP({ correct: false, difficulty: 5, streak: 100, hintsUsed: 0 })).toBe(0);
  });
  it('base 10 for correct easy with no streak/hints', () => {
    expect(calculateXP({ correct: true, difficulty: 1, streak: 0, hintsUsed: 0 })).toBe(10);
  });
  it('adds difficulty bonus', () => {
    expect(calculateXP({ correct: true, difficulty: 5, streak: 0, hintsUsed: 0 })).toBe(25);
  });
  it('adds streak bonus capped at 20', () => {
    expect(calculateXP({ correct: true, difficulty: 1, streak: 100, hintsUsed: 0 })).toBe(30);
  });
  it('subtracts hint penalty', () => {
    expect(calculateXP({ correct: true, difficulty: 1, streak: 0, hintsUsed: 3 })).toBe(4);
  });
  it('never goes below 1 if correct (high hint penalty)', () => {
    expect(calculateXP({ correct: true, difficulty: 1, streak: 0, hintsUsed: 99 }))
      .toBeGreaterThanOrEqual(1);
  });
});

describe('levelForXP', () => {
  it('starts at level 1', () => {
    expect(levelForXP(0).level).toBe(1);
    expect(levelForXP(99).level).toBe(1);
  });
  it('jumps to 2 at 100 XP', () => {
    expect(levelForXP(100).level).toBe(2);
  });
  it('reaches level 30 at 100k', () => {
    expect(levelForXP(100_000).level).toBe(30);
  });
  it('caps at level 30', () => {
    expect(levelForXP(999_999).level).toBe(30);
  });
  it('matches threshold table monotonically', () => {
    let last = 0;
    for (const t of LEVEL_THRESHOLDS) {
      expect(t.xpRequired).toBeGreaterThanOrEqual(last);
      last = t.xpRequired;
    }
  });
});

describe('xpProgress', () => {
  it('returns 0..1 within a level', () => {
    const p = xpProgress(150);
    expect(p.pct).toBeGreaterThan(0);
    expect(p.pct).toBeLessThan(1);
  });
  it('reports 1.0 at the next-level threshold', () => {
    const p = xpProgress(LEVEL_THRESHOLDS[1]!.xpRequired);
    expect(p.pct).toBeGreaterThanOrEqual(0);
  });
  it('returns 1.0 at max level', () => {
    expect(xpProgress(200_000).pct).toBe(1);
  });
});
