/**
 * Adaptive selection engine.
 *
 * Given a user's mastery state across selected skills, decide:
 *   - which skill to ask next
 *   - at what difficulty
 *
 * Goals:
 *   - Keep the student in the "flow zone" (success rate 70-85%).
 *   - Surface skills that are due for review (spaced repetition).
 *   - Slowly raise difficulty as mastery grows.
 *   - Drop difficulty after wrong answers — but only by 1 step, never to
 *     zero — so the student never feels punished.
 */

import type { Skill, SkillMastery } from '@/types/core';

export interface PickContext {
  /** All skills the user opted into for this session. */
  candidates: Skill[];
  /** Mastery records for those skills. May be missing entries (treat as 0). */
  mastery: Map<string, SkillMastery>;
  /** The most recent attempts in this session — used to avoid repetition. */
  recentSkillIds: string[];
  /** Most recent correctness signal — drives the difficulty step. */
  lastWasCorrect?: boolean;
  /** Last attempted difficulty in this session. */
  lastDifficulty?: 1 | 2 | 3 | 4 | 5;
}

export interface PickResult {
  skill: Skill;
  difficulty: 1 | 2 | 3 | 4 | 5;
  reason: string;
}

const STARTING_DIFFICULTY: Record<string, 1 | 2 | 3 | 4 | 5> = {
  'K-1': 1, '2-3': 2, '4-5': 2, '6-7': 3, '8-9': 3, '10-12': 3,
};

export function pickNext(ctx: PickContext): PickResult {
  if (ctx.candidates.length === 0) {
    throw new Error('No candidate skills');
  }

  // Score each candidate. Higher score = better fit right now.
  const scored = ctx.candidates.map((skill) => {
    const m = ctx.mastery.get(skill.id);
    let score = 0;

    // 1) Spaced repetition — strongly prefer skills due for review.
    if (m?.dueAt) {
      const dueAt = new Date(m.dueAt).getTime();
      const overdueMs = Date.now() - dueAt;
      if (overdueMs >= 0) score += 6 + Math.min(overdueMs / (1000 * 60 * 60), 24); // cap +24
    }

    // 2) Weak-area focus — lower mastery → higher score, but don't pile-on.
    const mastery = m?.mastery ?? 0;
    score += (1 - mastery) * 4;

    // 3) New skills we haven't tried yet — modest bonus.
    if (!m || (m.attempts ?? 0) === 0) score += 2;

    // 4) Anti-repetition — penalize the last 3 skills.
    const reps = ctx.recentSkillIds.filter((id) => id === skill.id).length;
    score -= reps * 1.5;

    // 5) Slight preference for lower intrinsic difficulty when overall mastery is shaky.
    const avgMastery = avg([...ctx.mastery.values()].map((mm) => mm.mastery));
    if (avgMastery < 0.4) score += (3 - skill.intrinsicDifficulty) * 0.5;

    return { skill, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]!.skill;

  const difficulty = chooseDifficulty(top, ctx.mastery.get(top.id), ctx.lastWasCorrect, ctx.lastDifficulty);
  const reason = describeReason(top, ctx.mastery.get(top.id), ctx);

  return { skill: top, difficulty, reason };
}

function chooseDifficulty(
  skill: Skill,
  mastery: SkillMastery | undefined,
  lastCorrect: boolean | undefined,
  lastDifficulty: 1 | 2 | 3 | 4 | 5 | undefined,
): 1 | 2 | 3 | 4 | 5 {
  const start = STARTING_DIFFICULTY[skill.gradeBand] ?? 2;
  const m = mastery?.mastery ?? 0;
  const masteryDifficulty: 1 | 2 | 3 | 4 | 5 =
    m < 0.20 ? 1 :
    m < 0.40 ? 2 :
    m < 0.65 ? 3 :
    m < 0.85 ? 4 : 5;

  // Smooth real-time adjustment: nudge from last difficulty rather than jump.
  if (typeof lastDifficulty === 'number') {
    const target = lastCorrect === true
      ? Math.min(5, Math.max(masteryDifficulty, lastDifficulty + 1))
      : lastCorrect === false
      ? Math.max(1, Math.min(masteryDifficulty, lastDifficulty - 1))
      : masteryDifficulty;
    return clampDiff(target);
  }

  return clampDiff(Math.max(start, masteryDifficulty));
}

function clampDiff(n: number): 1 | 2 | 3 | 4 | 5 {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return Math.round(n) as 2 | 3 | 4;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function describeReason(skill: Skill, mastery: SkillMastery | undefined, ctx: PickContext): string {
  if (!mastery || mastery.attempts === 0) return `New skill: ${skill.name}`;
  if (mastery.dueAt && new Date(mastery.dueAt).getTime() <= Date.now()) {
    return `Time to review ${skill.name}`;
  }
  if (mastery.mastery < 0.4) return `Building confidence in ${skill.name}`;
  if (mastery.mastery >= 0.85) return `Stretching with harder ${skill.name}`;
  return `Practicing ${skill.name}`;
}
