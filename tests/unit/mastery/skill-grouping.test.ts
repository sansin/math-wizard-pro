import { describe, it, expect } from 'vitest';
import {
  GRADE_BAND_ORDER,
  PREREQ_MASTERY_THRESHOLD,
  distinctModules,
  gradeBandIndex,
  groupSkillsByGradeAndDifficulty,
  moduleProgress,
  sortSkillsByGradeAndDifficulty,
  unmetPrerequisites,
} from '@/lib/mastery/skill-grouping';
import type { Skill } from '@/types/core';

function makeSkill(o: Partial<Skill> & Pick<Skill, 'id' | 'name'>): Skill {
  return {
    id: o.id,
    name: o.name,
    module: o.module ?? 'Algebra',
    topic: o.topic ?? 'Linear equations',
    gradeBand: o.gradeBand ?? '6-7',
    intrinsicDifficulty: o.intrinsicDifficulty ?? 3,
    prerequisites: o.prerequisites ?? [],
    standards: o.standards ?? [],
  };
}

describe('GRADE_BAND_ORDER and gradeBandIndex', () => {
  it('orders grade bands chronologically (not lexically)', () => {
    expect(GRADE_BAND_ORDER).toEqual(['K-1', '2-3', '4-5', '6-7', '8-9', '10-12']);
  });

  it('returns 0 for K-1 and 5 for 10-12', () => {
    expect(gradeBandIndex('K-1')).toBe(0);
    expect(gradeBandIndex('10-12')).toBe(5);
  });

  it('puts 2-3 before 10-12 (defeats lexical sort)', () => {
    expect(gradeBandIndex('2-3')).toBeLessThan(gradeBandIndex('10-12'));
  });

  it('returns sentinel-large index for unknown band', () => {
    // Cast through unknown to fake an out-of-union value.
    const idx = gradeBandIndex('99-100' as unknown as 'K-1');
    expect(idx).toBeGreaterThanOrEqual(GRADE_BAND_ORDER.length);
  });
});

describe('sortSkillsByGradeAndDifficulty', () => {
  it('sorts primarily by grade band, then by intrinsic difficulty', () => {
    const a = makeSkill({ id: 'a', name: 'A', gradeBand: '6-7', intrinsicDifficulty: 5 });
    const b = makeSkill({ id: 'b', name: 'B', gradeBand: 'K-1', intrinsicDifficulty: 2 });
    const c = makeSkill({ id: 'c', name: 'C', gradeBand: '6-7', intrinsicDifficulty: 1 });
    const sorted = sortSkillsByGradeAndDifficulty([a, b, c]);
    expect(sorted.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders K-1 d3 BEFORE 10-12 d1 (grade dominates)', () => {
    const easy_high_grade = makeSkill({
      id: 'hd1',
      name: 'Calc easy',
      gradeBand: '10-12',
      intrinsicDifficulty: 1,
    });
    const harder_low_grade = makeSkill({
      id: 'k3',
      name: 'K hard',
      gradeBand: 'K-1',
      intrinsicDifficulty: 3,
    });
    const sorted = sortSkillsByGradeAndDifficulty([easy_high_grade, harder_low_grade]);
    expect(sorted.map((s) => s.id)).toEqual(['k3', 'hd1']);
  });

  it('breaks ties by name alphabetically for stable order', () => {
    const z = makeSkill({ id: 'z', name: 'Zebra', gradeBand: '4-5', intrinsicDifficulty: 3 });
    const a = makeSkill({ id: 'a', name: 'Apple', gradeBand: '4-5', intrinsicDifficulty: 3 });
    const m = makeSkill({ id: 'm', name: 'Mango', gradeBand: '4-5', intrinsicDifficulty: 3 });
    const sorted = sortSkillsByGradeAndDifficulty([z, a, m]);
    expect(sorted.map((s) => s.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('does not mutate the input array', () => {
    const input = [
      makeSkill({ id: 'a', name: 'A', gradeBand: '6-7' }),
      makeSkill({ id: 'b', name: 'B', gradeBand: 'K-1' }),
    ];
    const inputCopy = [...input];
    sortSkillsByGradeAndDifficulty(input);
    expect(input).toEqual(inputCopy);
  });
});

describe('groupSkillsByGradeAndDifficulty', () => {
  it('groups by (gradeBand, difficulty) and returns groups in chronological order', () => {
    const skills = [
      makeSkill({ id: 'a', name: 'A', gradeBand: '6-7', intrinsicDifficulty: 4 }),
      makeSkill({ id: 'b', name: 'B', gradeBand: '6-7', intrinsicDifficulty: 3 }),
      makeSkill({ id: 'c', name: 'C', gradeBand: 'K-1', intrinsicDifficulty: 2 }),
      makeSkill({ id: 'd', name: 'D', gradeBand: '6-7', intrinsicDifficulty: 3 }),
    ];
    const groups = groupSkillsByGradeAndDifficulty(skills);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ gradeBand: 'K-1', difficulty: 2 });
    expect(groups[1]).toMatchObject({ gradeBand: '6-7', difficulty: 3 });
    expect(groups[2]).toMatchObject({ gradeBand: '6-7', difficulty: 4 });
    expect(groups[1]!.skills.map((s) => s.id)).toEqual(['b', 'd']);
  });

  it('returns empty array for empty input', () => {
    expect(groupSkillsByGradeAndDifficulty([])).toEqual([]);
  });

  it("uses the first skill's topic for the group label", () => {
    const skills = [
      makeSkill({
        id: 'a', name: 'A', gradeBand: '6-7', intrinsicDifficulty: 3,
        topic: 'Linear equations',
      }),
      makeSkill({
        id: 'b', name: 'B', gradeBand: '6-7', intrinsicDifficulty: 3,
        topic: 'Different topic',
      }),
    ];
    const groups = groupSkillsByGradeAndDifficulty(skills);
    expect(groups[0]!.topic).toBeDefined();
    expect(typeof groups[0]!.topic).toBe('string');
  });
});

describe('distinctModules', () => {
  it('returns unique modules sorted by frequency descending', () => {
    const skills = [
      makeSkill({ id: 'a', name: 'a', module: 'Addition' }),
      makeSkill({ id: 'b', name: 'b', module: 'Algebra' }),
      makeSkill({ id: 'c', name: 'c', module: 'Algebra' }),
      makeSkill({ id: 'd', name: 'd', module: 'Algebra' }),
      makeSkill({ id: 'e', name: 'e', module: 'Geometry' }),
      makeSkill({ id: 'f', name: 'f', module: 'Geometry' }),
    ];
    expect(distinctModules(skills)).toEqual(['Algebra', 'Geometry', 'Addition']);
  });

  it('breaks frequency ties alphabetically', () => {
    const skills = [
      makeSkill({ id: 'a', name: 'a', module: 'Zoo' }),
      makeSkill({ id: 'b', name: 'b', module: 'Apple' }),
    ];
    expect(distinctModules(skills)).toEqual(['Apple', 'Zoo']);
  });

  it('returns empty array for empty input', () => {
    expect(distinctModules([])).toEqual([]);
  });
});

describe('unmetPrerequisites', () => {
  const target = makeSkill({
    id: 'algebra.systems',
    name: 'Systems',
    prerequisites: ['algebra.linear', 'algebra.expr'],
  });

  it('returns no unmet prereqs when the skill has none', () => {
    const noprereq = makeSkill({ id: 'k1.add', name: 'Add', prerequisites: [] });
    expect(unmetPrerequisites(noprereq, {})).toEqual([]);
  });

  it('treats a prerequisite the user has never attempted as unmet', () => {
    expect(unmetPrerequisites(target, {})).toEqual(['algebra.linear', 'algebra.expr']);
  });

  it('treats a prerequisite below the threshold as unmet', () => {
    const masteries = {
      'algebra.linear': { mastery: 0.3, attempts: 5, lastAttemptAt: null },
      'algebra.expr': { mastery: 0.6, attempts: 5, lastAttemptAt: null },
    };
    expect(unmetPrerequisites(target, masteries)).toEqual(['algebra.linear']);
  });

  it('treats a prerequisite at exactly the threshold as STILL UNMET (strict <)', () => {
    // The threshold is the floor of "good enough" — being AT it is the
    // boundary case. We use `< THRESHOLD` so users at exactly the floor
    // get the gentle warning, encouraging them to keep practicing.
    const masteries = {
      'algebra.linear': { mastery: PREREQ_MASTERY_THRESHOLD, attempts: 5, lastAttemptAt: null },
      'algebra.expr': { mastery: PREREQ_MASTERY_THRESHOLD + 0.01, attempts: 5, lastAttemptAt: null },
    };
    expect(unmetPrerequisites(target, masteries)).toEqual([]);
  });

  it('returns an empty array when ALL prereqs are above threshold', () => {
    const masteries = {
      'algebra.linear': { mastery: 0.9, attempts: 20, lastAttemptAt: null },
      'algebra.expr': { mastery: 0.85, attempts: 15, lastAttemptAt: null },
    };
    expect(unmetPrerequisites(target, masteries)).toEqual([]);
  });

  it('preserves the order of skill.prerequisites in the output', () => {
    const skill = makeSkill({
      id: 's',
      name: 's',
      prerequisites: ['c', 'a', 'b'],
    });
    expect(unmetPrerequisites(skill, {})).toEqual(['c', 'a', 'b']);
  });
});

describe('moduleProgress', () => {
  it('returns zeros for empty input', () => {
    expect(moduleProgress([], {})).toEqual({ mastery: 0, touchedCount: 0, totalCount: 0 });
  });

  it('counts only attempted skills toward weighted average', () => {
    const skills = [
      makeSkill({ id: 'a', name: 'a' }),
      makeSkill({ id: 'b', name: 'b' }),
      makeSkill({ id: 'c', name: 'c' }),
    ];
    const masteries = {
      a: { mastery: 0.8, attempts: 5, lastAttemptAt: null },
      b: { mastery: 0.4, attempts: 5, lastAttemptAt: null },
      // c untouched
    };
    const r = moduleProgress(skills, masteries);
    expect(r.touchedCount).toBe(2);
    expect(r.totalCount).toBe(3);
    // Equal weights → simple mean of touched skills
    expect(r.mastery).toBeCloseTo(0.6, 5);
  });

  it('returns 0 mastery and 0 touched when no skill has been practiced', () => {
    const skills = [makeSkill({ id: 'a', name: 'a' })];
    expect(moduleProgress(skills, {})).toEqual({
      mastery: 0,
      touchedCount: 0,
      totalCount: 1,
    });
  });

  it('weights more-attempted skills higher (capped at 10)', () => {
    const skills = [
      makeSkill({ id: 'hot', name: 'hot' }),
      makeSkill({ id: 'cold', name: 'cold' }),
    ];
    const masteries = {
      hot: { mastery: 0.9, attempts: 50, lastAttemptAt: null },
      cold: { mastery: 0.1, attempts: 1, lastAttemptAt: null },
    };
    const r = moduleProgress(skills, masteries);
    // hot weight = 10 (capped), cold weight = 1; mean = (10*0.9 + 1*0.1) / 11
    expect(r.mastery).toBeCloseTo((10 * 0.9 + 1 * 0.1) / 11, 5);
  });

  it('counts a skill with attempts=0 as untouched even if it has a row', () => {
    const skills = [makeSkill({ id: 'a', name: 'a' })];
    const masteries = {
      a: { mastery: 0.5, attempts: 0, lastAttemptAt: null },
    };
    const r = moduleProgress(skills, masteries);
    expect(r.touchedCount).toBe(0);
    expect(r.mastery).toBe(0);
  });
});
