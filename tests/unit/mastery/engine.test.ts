import { describe, it, expect } from 'vitest';
import { pickNext } from '@/lib/mastery/engine';
import type { Skill, SkillMastery } from '@/types/core';

const skills: Skill[] = [
  { id: 'a', name: 'Skill A', module: 'M', topic: 'T', gradeBand: '4-5', intrinsicDifficulty: 2, prerequisites: [] },
  { id: 'b', name: 'Skill B', module: 'M', topic: 'T', gradeBand: '4-5', intrinsicDifficulty: 3, prerequisites: [] },
  { id: 'c', name: 'Skill C', module: 'M', topic: 'T', gradeBand: '4-5', intrinsicDifficulty: 4, prerequisites: [] },
];

function masteryRow(overrides: Partial<SkillMastery> & Pick<SkillMastery, 'skillId'>): SkillMastery {
  return {
    userId: 'u',
    mastery: 0.5,
    confidence: 0.5,
    attempts: 5,
    correctStreak: 0,
    lastAttemptAt: null,
    dueAt: null,
    avgCorrectDifficulty: 2,
    ...overrides,
  };
}

describe('pickNext', () => {
  it('throws on no candidates', () => {
    expect(() => pickNext({ candidates: [], mastery: new Map(), recentSkillIds: [] })).toThrow();
  });

  it('returns one of the candidates', () => {
    const out = pickNext({ candidates: skills, mastery: new Map(), recentSkillIds: [] });
    expect(skills.find((s) => s.id === out.skill.id)).toBeTruthy();
  });

  it('prefers due skills over not-due ones', () => {
    const m = new Map<string, SkillMastery>([
      ['a', masteryRow({ skillId: 'a', mastery: 0.9, dueAt: new Date(Date.now() - 3600_000).toISOString() })],
      ['b', masteryRow({ skillId: 'b', mastery: 0.5, dueAt: new Date(Date.now() + 86400_000).toISOString() })],
    ]);
    const out = pickNext({ candidates: skills, mastery: m, recentSkillIds: [] });
    expect(out.skill.id).toBe('a');
  });

  it('penalizes recently-attempted skills', () => {
    const m = new Map<string, SkillMastery>([
      ['a', masteryRow({ skillId: 'a', mastery: 0.5 })],
      ['b', masteryRow({ skillId: 'b', mastery: 0.5 })],
    ]);
    const out = pickNext({ candidates: skills, mastery: m, recentSkillIds: ['a', 'a', 'a'] });
    expect(out.skill.id).not.toBe('a');
  });

  it('ramps difficulty up on correct answer', () => {
    const out = pickNext({
      candidates: skills,
      mastery: new Map([['a', masteryRow({ skillId: 'a', mastery: 0.7 })]]),
      recentSkillIds: [],
      lastDifficulty: 3,
      lastWasCorrect: true,
    });
    expect(out.difficulty).toBeGreaterThanOrEqual(3);
  });

  it('softens difficulty on wrong answer', () => {
    const out = pickNext({
      candidates: skills,
      mastery: new Map([['a', masteryRow({ skillId: 'a', mastery: 0.7 })]]),
      recentSkillIds: [],
      lastDifficulty: 4,
      lastWasCorrect: false,
    });
    expect(out.difficulty).toBeLessThanOrEqual(4);
  });

  it('clamps difficulty to 1..5', () => {
    const out1 = pickNext({
      candidates: skills,
      mastery: new Map(),
      recentSkillIds: [],
      lastDifficulty: 5,
      lastWasCorrect: true,
    });
    expect(out1.difficulty).toBeLessThanOrEqual(5);
    const out2 = pickNext({
      candidates: skills,
      mastery: new Map(),
      recentSkillIds: [],
      lastDifficulty: 1,
      lastWasCorrect: false,
    });
    expect(out2.difficulty).toBeGreaterThanOrEqual(1);
  });
});
