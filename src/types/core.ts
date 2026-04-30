/**
 * Core domain types for Math Wizard Pro.
 *
 * Design principle: every question has a verified answer at generation time.
 * No regex re-derivation on the client. Ever.
 */

// ─── Curriculum primitives ─────────────────────────────────────────────

export type GradeBand = 'K-1' | '2-3' | '4-5' | '6-7' | '8-9' | '10-12';

export type SkillId = string; // e.g. "add.regroup.2digit"

export interface Skill {
  id: SkillId;
  name: string;
  gradeBand: GradeBand;
  module: string;        // human-facing grouping, e.g. "Addition"
  topic: string;         // human-facing sub-topic, e.g. "Addition with regrouping"
  prerequisites: SkillId[];
  /** A 1-5 scale where 1 is trivially easy, 5 is the hardest expected for the band. */
  intrinsicDifficulty: 1 | 2 | 3 | 4 | 5;
  /** Common Core / curriculum standard codes, optional. */
  standards?: string[];
}

// ─── Questions & answers ───────────────────────────────────────────────

export type AnswerKind =
  | { type: 'numeric'; value: number; tolerance?: number }
  | { type: 'fraction'; numerator: number; denominator: number }
  | { type: 'expression'; canonical: string }    // e.g. "6x", validated symbolically
  | { type: 'text'; value: string; caseSensitive?: boolean }
  | { type: 'multipleChoice'; correctIndex: number; options: string[] };

export interface Question {
  id: string;
  /** Stable hash of the prompt — used to dedupe across sessions. */
  promptHash: string;
  skillId: SkillId;
  /** 1-5 difficulty within the skill (independent of skill's intrinsic difficulty). */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Plain-text + LaTeX. LaTeX delimited by $...$ for inline, $$...$$ for block. */
  prompt: string;
  answer: AnswerKind;
  /** Pre-generated worked solution shown after wrong answer or on request. */
  solution: SolutionStep[];
  /** Three progressive hints, never revealing the answer. */
  hints: [Hint, Hint, Hint];
  /** Source: 'ai' | 'curated' | 'template' */
  source: 'ai' | 'curated' | 'template';
  /** Provider used if source==='ai' */
  provider?: AIProviderId;
  /** True if the answer was verified by the math engine, not just produced by the AI. */
  verified: boolean;
  createdAt: string;
}

export interface Hint {
  /** 1 = nudge in the right direction; 2 = strategy; 3 = almost-there */
  level: 1 | 2 | 3;
  /** LaTeX-friendly, never contains the final answer. */
  text: string;
}

export interface SolutionStep {
  /** Title of this step, e.g. "Step 1 — Subtract 5 from both sides" */
  title: string;
  /** LaTeX-friendly explanation. */
  detail: string;
  /** Optional intermediate state, e.g. "2x = 8". */
  state?: string;
}

// ─── User attempts ─────────────────────────────────────────────────────

export interface AttemptResult {
  questionId: string;
  userId: string;
  submitted: string;             // raw user input
  parsed: AnswerKind | null;
  correct: boolean;
  hintsUsed: number;
  timeMs: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  skillId: SkillId;
  attemptedAt: string;
}

// ─── Mastery model ─────────────────────────────────────────────────────

/**
 * Per-skill mastery state. Inspired by FSRS but simplified for K-12 math.
 *  - mastery: 0-1 estimate of P(correct on next attempt at intrinsicDifficulty)
 *  - confidence: how certain we are in that estimate (more attempts → higher)
 *  - dueAt: when this skill should be revisited for spaced repetition
 */
export interface SkillMastery {
  userId: string;
  skillId: SkillId;
  mastery: number;          // 0..1
  confidence: number;       // 0..1
  attempts: number;
  correctStreak: number;
  lastAttemptAt: string | null;
  dueAt: string | null;     // ISO date — when to revisit
  /** Average difficulty completed correctly. */
  avgCorrectDifficulty: number;
}

// ─── Sessions ──────────────────────────────────────────────────────────

export type SessionMode = 'practice' | 'test' | 'review' | 'challenge';

export interface PracticeSession {
  id: string;
  userId: string;
  mode: SessionMode;
  gradeBand: GradeBand;
  skillIds: SkillId[];
  startedAt: string;
  endedAt: string | null;
  questionCount: number;
  correctCount: number;
  xpEarned: number;
}

// ─── XP ────────────────────────────────────────────────────────────────

export interface XPState {
  totalXP: number;
  level: number;            // 1-30 (extended ladder vs v1)
  levelTitle: string;
  currentLevelXP: number;
  nextLevelXP: number;
  progress: number;         // 0..1 toward next level
  dailyGoal: number;
  dailyAnswered: number;
  weeklyAnswered: number;
  longestStreak: number;
  currentStreak: number;
}

// ─── AI providers ──────────────────────────────────────────────────────

export type AIProviderId =
  | 'gemini'
  | 'claude'
  | 'openai'
  | 'deepseek'
  | 'groq'
  | 'cerebras'
  | 'cloudflare'
  | 'openrouter'
  | 'mistral'
  | 'huggingface';

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  tagline: string;
  freeTier: string;
  signupUrl: string;
  /** Friendly tutorial steps for the BYOK modal. */
  setupSteps: string[];
  defaultModel: string;
  /** Latency tier — used for routing. */
  latencyTier: 'instant' | 'fast' | 'normal';
  /** Quality tier for math reasoning. */
  qualityTier: 'frontier' | 'high' | 'good';
  /** What this provider is best for. */
  strengths: string[];
}

export interface UserAPIKey {
  userId: string;
  provider: AIProviderId;
  /** Last 4 chars only — for display. The encrypted key lives server-side. */
  hint: string;
  active: boolean;
  addedAt: string;
}

// ─── Parent ────────────────────────────────────────────────────────────

export interface ParentLink {
  parentUserId: string;
  childUserId: string;
  linkedAt: string;
  status: 'active' | 'pending' | 'revoked';
}

export interface WeeklyDigest {
  childName: string;
  weekStart: string;
  weekEnd: string;
  totalQuestions: number;
  accuracy: number;
  xpGained: number;
  daysActive: number;
  topSkill: { name: string; accuracy: number };
  weakestSkill: { name: string; accuracy: number };
  /** AI-generated 2-3 sentence summary written for parents. */
  narrative: string;
}
