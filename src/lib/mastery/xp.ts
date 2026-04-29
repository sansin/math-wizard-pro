/**
 * XP calculator (client-side preview).
 *
 * The authoritative XP source is the Postgres trigger
 * `public.xp_earned(...)`, but we mirror the formula here so the UI can
 * show "+15 XP" instantly without a round-trip.
 *
 * Keep in sync with supabase/migrations/20260428000003_xp_and_mastery_triggers.sql.
 */

export interface XPInputs {
  correct: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  streak: number;       // current correct streak BEFORE this attempt
  hintsUsed: number;
}

const DIFFICULTY_BONUS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0, 2: 3, 3: 6, 4: 10, 5: 15,
};

export function calculateXP(inputs: XPInputs): number {
  if (!inputs.correct) return 0;
  const base = 10;
  const diff = DIFFICULTY_BONUS[inputs.difficulty];
  const streakBonus = Math.min(inputs.streak * 2, 20);
  const hintPenalty = inputs.hintsUsed === 0 ? 0
    : inputs.hintsUsed === 1 ? 2
    : inputs.hintsUsed === 2 ? 4
    : 6;
  return Math.max(1, base + diff + streakBonus - hintPenalty);
}

// ─── Level thresholds ──────────────────────────────────────────────────
// Mirrors the level_thresholds table.
export const LEVEL_THRESHOLDS: ReadonlyArray<{ level: number; xpRequired: number; title: string }> = [
  { level: 1,      xpRequired: 0,     title: 'Apprentice' },
  { level: 2,      xpRequired: 100,   title: 'Number Scout' },
  { level: 3,      xpRequired: 250,   title: 'Pattern Finder' },
  { level: 4,      xpRequired: 500,   title: 'Problem Solver' },
  { level: 5,      xpRequired: 850,   title: 'Equation Explorer' },
  { level: 6,      xpRequired: 1300,  title: 'Fraction Hero' },
  { level: 7,      xpRequired: 1850,  title: 'Algebra Adept' },
  { level: 8,      xpRequired: 2550,  title: 'Geometry Guide' },
  { level: 9,      xpRequired: 3400,  title: 'Probability Sage' },
  { level: 10,     xpRequired: 4400,  title: 'Calculus Cadet' },
  { level: 11,     xpRequired: 5550,  title: 'Math Knight' },
  { level: 12,     xpRequired: 6900,  title: 'Logic Master' },
  { level: 13,     xpRequired: 8400,  title: 'Theorem Hunter' },
  { level: 14,     xpRequired: 10100, title: 'Pi Whisperer' },
  { level: 15,     xpRequired: 12100, title: 'Function Wizard' },
  { level: 16,     xpRequired: 14400, title: 'Prime Sorcerer' },
  { level: 17,     xpRequired: 17000, title: 'Infinity Seeker' },
  { level: 18,     xpRequired: 20000, title: 'Topology Tactician' },
  { level: 19,     xpRequired: 23500, title: 'Set Conjurer' },
  { level: 20,     xpRequired: 27500, title: 'Vector Virtuoso' },
  { level: 21,     xpRequired: 32000, title: 'Matrix Mage' },
  { level: 22,     xpRequired: 37000, title: 'Differential Druid' },
  { level: 23,     xpRequired: 42500, title: 'Integral Illusionist' },
  { level: 24,     xpRequired: 48500, title: 'Series Sage' },
  { level: 25,     xpRequired: 55000, title: 'Limit Lord' },
  { level: 26,     xpRequired: 62000, title: 'Theorem Architect' },
  { level: 27,     xpRequired: 70000, title: 'Proof Paragon' },
  { level: 28,     xpRequired: 79000, title: 'Axiom Adept' },
  { level: 29,     xpRequired: 89000, title: 'Math Wizard Master' },
  { level: 30,     xpRequired: 100000, title: 'Archmage of Mathematics' },
];

export function levelForXP(xp: number): { level: number; title: string } {
  let result = LEVEL_THRESHOLDS[0]!;
  for (const t of LEVEL_THRESHOLDS) {
    if (xp >= t.xpRequired) result = t;
    else break;
  }
  return { level: result.level, title: result.title };
}

export function xpProgress(xp: number): { current: number; next: number; pct: number } {
  const lvl = levelForXP(xp);
  const idx = lvl.level - 1;
  const current = LEVEL_THRESHOLDS[idx]!.xpRequired;
  const next = LEVEL_THRESHOLDS[idx + 1]?.xpRequired ?? current;
  if (next === current) return { current, next, pct: 1 };
  return { current, next, pct: Math.min(1, (xp - current) / (next - current)) };
}
