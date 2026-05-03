/**
 * Pure helpers for the "view by module" path.
 *
 * Skills can be grouped two ways in the practice picker:
 *   - by grade band (existing default — students pick a grade, see modules)
 *   - by module (new — students pick a module, see skills across grades)
 *
 * The module-view path needs deterministic sort + group + prerequisite-check
 * helpers that are easy to unit-test in isolation. Anything that touches
 * localStorage, the network, or React state lives outside this file.
 */

import type { GradeBand, Skill, SkillId } from '@/types/core';

/**
 * Canonical chronological order of grade bands. Used to sort cross-grade
 * skill lists in the order students typically learn them — K-1 first,
 * 10-12 last. NOT alphabetical (`10-12` would sort before `2-3` lexically).
 */
export const GRADE_BAND_ORDER: GradeBand[] = ['K-1', '2-3', '4-5', '6-7', '8-9', '10-12'];

/** 0-based index of a grade band in chronological order. */
export function gradeBandIndex(band: GradeBand): number {
  const i = GRADE_BAND_ORDER.indexOf(band);
  return i < 0 ? GRADE_BAND_ORDER.length : i; // unknown → sort last
}

/**
 * Sort skills by chronological learning difficulty:
 *   1. grade band (K-1 → 10-12)
 *   2. intrinsic difficulty within the grade (1 → 5)
 *   3. skill name (alphabetical) for stable order
 *
 * This is the order recommended by `Decision 1A` — a 6-7 grade "d3"
 * is harder than a K-1 "d3" because grade band dominates. Pure
 * intrinsic-difficulty sort is intentionally NOT what we do.
 */
export function sortSkillsByGradeAndDifficulty(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => {
    const ag = gradeBandIndex(a.gradeBand);
    const bg = gradeBandIndex(b.gradeBand);
    if (ag !== bg) return ag - bg;
    if (a.intrinsicDifficulty !== b.intrinsicDifficulty) {
      return a.intrinsicDifficulty - b.intrinsicDifficulty;
    }
    return a.name.localeCompare(b.name);
  });
}

/** A `(gradeBand, intrinsicDifficulty)` group with its members. */
export interface SkillGroup {
  gradeBand: GradeBand;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Human-facing topic — e.g., "Linear equations". Pulled from the first
   * member's `topic` since members within a group share it most of the time. */
  topic: string;
  skills: Skill[];
}

/**
 * Group an already-filtered (single-module) skill list by
 * `(gradeBand, intrinsicDifficulty)`. Groups come back in chronological
 * order. Skills inside each group are sorted alphabetically by name.
 */
export function groupSkillsByGradeAndDifficulty(skills: Skill[]): SkillGroup[] {
  const sorted = sortSkillsByGradeAndDifficulty(skills);
  const groups = new Map<string, SkillGroup>();
  for (const s of sorted) {
    const key = `${s.gradeBand}|${s.intrinsicDifficulty}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        gradeBand: s.gradeBand,
        difficulty: s.intrinsicDifficulty,
        topic: s.topic,
        skills: [],
      };
      groups.set(key, group);
    }
    group.skills.push(s);
  }
  return Array.from(groups.values());
}

/** All distinct module names from a skill list, ordered by appearance frequency
 *  (most-populated module first) then alphabetically. */
export function distinctModules(skills: Skill[]): string[] {
  const counts = new Map<string, number>();
  for (const s of skills) counts.set(s.module, (counts.get(s.module) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([m]) => m);
}

/** Mastery info as the `/api/skills?withMastery=1` endpoint returns it. */
export interface MasteryInfo {
  mastery: number;        // 0..1
  attempts: number;
  lastAttemptAt: string | null;
}

/**
 * The mastery threshold above which a prerequisite skill is considered
 * "completed enough" to no longer warn about. Matches the cutoff used
 * elsewhere in the mastery engine for "Familiar / Solid".
 */
export const PREREQ_MASTERY_THRESHOLD = 0.5;

/**
 * Return the IDs of any prerequisites for `skill` that the user has NOT
 * yet reached the mastery threshold on.
 *
 * Notes:
 *   - A prerequisite that the user has never attempted (no entry in
 *     `masteryByskillId`) counts as unmet.
 *   - We deliberately do NOT block selection — the caller decides
 *     whether to show a warning, dim the row, or pass through silently.
 *   - Order of returned IDs matches `skill.prerequisites` for stable UI.
 */
export function unmetPrerequisites(
  skill: Skill,
  masteryByskillId: Record<SkillId, MasteryInfo>,
): SkillId[] {
  if (!skill.prerequisites || skill.prerequisites.length === 0) return [];
  return skill.prerequisites.filter((preqId) => {
    const m = masteryByskillId[preqId];
    if (!m) return true;
    return m.mastery < PREREQ_MASTERY_THRESHOLD;
  });
}

/**
 * Aggregate progress across a set of skills (typically all skills in a
 * single module). Returns the average mastery, weighted by attempts so
 * skills the student has actually practiced count more than untouched
 * ones. Pure mean falls out when every skill has equal attempts.
 *
 * Returns 0 when the input is empty (no skills) or when no skills have
 * any attempts yet.
 */
export function moduleProgress(
  skills: Skill[],
  masteryByskillId: Record<SkillId, MasteryInfo>,
): { mastery: number; touchedCount: number; totalCount: number } {
  if (skills.length === 0) return { mastery: 0, touchedCount: 0, totalCount: 0 };
  let weighted = 0;
  let weight = 0;
  let touched = 0;
  for (const s of skills) {
    const m = masteryByskillId[s.id];
    if (!m || m.attempts === 0) continue;
    touched++;
    // Weight: 1 for first attempt, capped at 10 (so a single hot skill
    // doesn't dominate the module average).
    const w = Math.min(10, Math.max(1, m.attempts));
    weighted += w * m.mastery;
    weight += w;
  }
  return {
    mastery: weight > 0 ? weighted / weight : 0,
    touchedCount: touched,
    totalCount: skills.length,
  };
}
