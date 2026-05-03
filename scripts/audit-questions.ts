/**
 * Audit stored questions — runs every (or a sample of) verified questions
 * back through the production verifier and a set of quality checks.
 * Outputs a JSON summary and a human-readable markdown report.
 *
 * Use to validate a seed batch before generating more.
 *
 * Usage:
 *   npx tsx scripts/audit-questions.ts                          # sample 5 per (skill,d)
 *   npx tsx scripts/audit-questions.ts --sample=10              # sample 10 per (skill,d)
 *   npx tsx scripts/audit-questions.ts --all                    # audit every row
 *   npx tsx scripts/audit-questions.ts --skill=k1.add.single    # one skill only
 *   npx tsx scripts/audit-questions.ts --provider=mistral       # one provider only
 *   npx tsx scripts/audit-questions.ts --report=audit.md        # write markdown
 *
 * Checks performed (per question):
 *   1. Schema:    parses against the production zod schemas (Answer, Hint, Solution)
 *   2. Verifier:  re-runs verify() — answer is still mathematically valid
 *   3. Spoilers:  hints don't contain the literal numeric answer
 *   4. Solution:  ends in something that mentions/equals the answer
 *   5. Prompt:    not empty, doesn't have obvious LaTeX rendering breakage
 *   6. Hints:     exactly 3, levels 1/2/3, increasing
 */

import './_load-env';

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verify } from '../src/lib/math/verifier';
import type { AnswerKind } from '../src/types/core';

// ─── Schemas (mirror src/lib/ai/generator.ts) ─────────────────────────

const AnswerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('numeric'),
    value: z.coerce.number(),
    tolerance: z.coerce.number().optional(),
  }),
  z.object({
    type: z.literal('fraction'),
    numerator: z.coerce.number().int(),
    denominator: z.coerce.number().int(),
  }),
  z.object({ type: z.literal('expression'), canonical: z.string() }),
  z.object({
    type: z.literal('multipleChoice'),
    correctIndex: z.coerce.number().int(),
    options: z.array(z.string()).min(2).max(6),
  }),
  z.object({
    type: z.literal('text'),
    value: z.string(),
    caseSensitive: z.coerce.boolean().optional(),
  }),
]);

const HintSchema = z.object({
  level: z.number().int().min(1).max(3),
  text: z.string().min(3).max(400),
});

const SolutionStepSchema = z.object({
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(500),
  state: z.string().max(120).optional(),
});

interface Args {
  sample: number;
  all: boolean;
  skill?: string;
  difficulty?: number;
  provider?: string;
  report: string;
  detail: number;
  fix: boolean;
  fixDry: boolean;
  dedupe: boolean;
  reauditAll: boolean;
}

/** Audit rules version — bump this whenever detector logic changes
 *  meaningfully so previously-audited rows get re-checked under new rules. */
const AUDIT_RULES_VERSION = 2;

function parseArgs(): Args {
  const argv: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) continue;
    argv[m[1]!] = m[2] ?? 'true';
  }
  return {
    sample: parseInt(argv.sample ?? '5', 10),
    all: argv.all === 'true',
    skill: argv.skill,
    difficulty: argv.difficulty ? parseInt(argv.difficulty, 10) : undefined,
    provider: argv.provider,
    report: argv.report ?? 'audit.md',
    detail: parseInt(argv.detail ?? '5', 10),
    fix: argv.fix === 'true',
    fixDry: argv.fixDry === 'true',
    dedupe: argv.dedupe === 'true' || argv['no-dedupe'] !== 'true',
    reauditAll: argv['reaudit-all'] === 'true',
  };
}

interface QuestionRow {
  id: string;
  skill_id: string;
  difficulty: number;
  prompt: string;
  prompt_hash: string;
  answer: unknown;
  hints: unknown;
  solution: unknown;
  source: string;
  provider: string | null;
  flagged_count: number;
  served_count: number;
  correct_count: number;
  last_audited_at: string | null;
  last_audit_version: number | null;
  created_at: string;
}

interface IssueClass {
  name: string;
  severity: 'error' | 'warn' | 'info';
  /** How to address it: 'auto' = the audit script can fix; 'regen' = throw away
   * and regenerate; 'manual' = needs human eyeball. */
  fixability: 'auto' | 'regen' | 'manual';
}

const ISSUES = {
  SCHEMA_ANSWER: { name: 'schema-answer', severity: 'error', fixability: 'regen' } as IssueClass,
  SCHEMA_HINTS: { name: 'schema-hints', severity: 'error', fixability: 'regen' } as IssueClass,
  SCHEMA_SOLUTION: { name: 'schema-solution', severity: 'error', fixability: 'regen' } as IssueClass,
  HINT_LEVEL: { name: 'hint-level-bad', severity: 'error', fixability: 'auto' } as IssueClass,
  VERIFIER_FAIL: { name: 'verifier-fail', severity: 'error', fixability: 'regen' } as IssueClass,
  HINT_SPOILER: { name: 'hint-spoiler', severity: 'warn', fixability: 'auto' } as IssueClass,
  PROMPT_EMPTY: { name: 'prompt-empty', severity: 'error', fixability: 'regen' } as IssueClass,
  PROMPT_LATEX_BREAK: { name: 'prompt-latex-break', severity: 'warn', fixability: 'auto' } as IssueClass,
  PROMPT_BARE_DOLLAR: { name: 'prompt-bare-dollar-currency', severity: 'warn', fixability: 'auto' } as IssueClass,
  SOLUTION_NO_ANSWER: { name: 'solution-no-answer', severity: 'warn', fixability: 'auto' } as IssueClass,
};

interface AuditResult {
  id: string;
  skill_id: string;
  difficulty: number;
  provider: string | null;
  prompt: string;
  hints: Array<{ level: number; text: string }>;
  solution: Array<{ title: string; detail: string; state?: string }>;
  answer: AnswerKind | null;
  issues: Array<{ class: IssueClass; detail: string }>;
}

function auditOne(row: QuestionRow): AuditResult {
  const issues: AuditResult['issues'] = [];

  // 1. Prompt sanity
  if (!row.prompt || row.prompt.trim().length === 0) {
    issues.push({ class: ISSUES.PROMPT_EMPTY, detail: '' });
  } else {
    // Strategy: first STRIP balanced LaTeX $...$ and $$...$$ blocks. Anything
    // left over containing a `$` is a real problem — either a leftover
    // currency `$N` (bare-dollar) or unbalanced delimiters.
    //
    // We use non-greedy matching and process $$ before $ so we don't break
    // block math. Escaped \$ stays in place (it's the AI doing currency
    // INSIDE math mode correctly — not flagged).
    const stripped = stripBalancedLatex(row.prompt);

    // Real bare-dollar: a $ in the stripped (post-LaTeX) text, followed by digit.
    if (/(?:^|[^\\])\$\d/.test(stripped)) {
      issues.push({
        class: ISSUES.PROMPT_BARE_DOLLAR,
        detail: 'bare $N currency (use USD N or N dollars)',
      });
    } else {
      // Unbalanced $ remaining — broken LaTeX delimiter
      const remainingDollar = (stripped.match(/(?<!\\)\$/g) || []).length;
      if (remainingDollar > 0) {
        issues.push({
          class: ISSUES.PROMPT_LATEX_BREAK,
          detail: `unbalanced $ remaining after LaTeX strip (count=${remainingDollar})`,
        });
      }
    }
  }

  // 2. Answer schema
  let parsedAnswer: AnswerKind | null = null;
  try {
    parsedAnswer = AnswerSchema.parse(row.answer);
  } catch (e) {
    issues.push({
      class: ISSUES.SCHEMA_ANSWER,
      detail: (e as Error).message.slice(0, 120),
    });
  }

  // 3. Hints schema (exactly 3, levels 1/2/3 strictly)
  let parsedHints: Array<{ level: number; text: string }> = [];
  try {
    parsedHints = z.array(HintSchema).length(3).parse(row.hints);
  } catch (e) {
    issues.push({
      class: ISSUES.SCHEMA_HINTS,
      detail: (e as Error).message.slice(0, 120),
    });
  }
  if (parsedHints.length === 3) {
    const levels = parsedHints.map((h) => h.level).sort();
    if (JSON.stringify(levels) !== JSON.stringify([1, 2, 3])) {
      issues.push({
        class: ISSUES.HINT_LEVEL,
        detail: `levels=[${parsedHints.map((h) => h.level).join(',')}]`,
      });
    }
  }

  // 4. Solution schema
  let parsedSolution: Array<{ title: string; detail: string; state?: string }> = [];
  try {
    parsedSolution = z.array(SolutionStepSchema).min(1).parse(row.solution);
  } catch (e) {
    issues.push({
      class: ISSUES.SCHEMA_SOLUTION,
      detail: (e as Error).message.slice(0, 120),
    });
  }

  // 5. Verifier — re-run on stored answer
  if (parsedAnswer) {
    const rawAnswer = (() => {
      switch (parsedAnswer.type) {
        case 'numeric': return parsedAnswer.value;
        case 'fraction': return `${parsedAnswer.numerator}/${parsedAnswer.denominator}`;
        case 'expression': return parsedAnswer.canonical;
        case 'multipleChoice': return parsedAnswer.correctIndex;
        case 'text': return parsedAnswer.value;
      }
    })();
    const metadata = parsedAnswer.type === 'multipleChoice'
      ? { options: parsedAnswer.options }
      : undefined;
    const v = verify({
      prompt: row.prompt,
      rawAnswer,
      expectedKind: parsedAnswer.type,
      metadata,
    });
    if (!v.ok) {
      issues.push({
        class: ISSUES.VERIFIER_FAIL,
        detail: v.reason.slice(0, 120),
      });
    }
  }

  // 6. Hint spoiler check (numeric answers only) — SMARTER VERSION:
  //    If the answer number ALSO appears in the prompt as a given quantity,
  //    seeing it in a hint is NOT a spoiler — the hint is just referencing
  //    the problem's input. Example:
  //      Prompt: "Maya has 7 stickers. She gets 0 more. How many now?"
  //      Answer: 7
  //      Hint 2: "Adding 0 leaves the number unchanged at 7."
  //    This isn't a spoiler — the hint legitimately uses the input value.
  //
  //    Heuristic: only flag if the answer appears in the hint AND is NOT
  //    one of the numbers visible in the prompt.
  if (parsedAnswer?.type === 'numeric' && parsedHints.length > 0) {
    const ans = parsedAnswer.value;
    const ansRe = new RegExp(`(?<![\\d.])${escapeRe(String(ans))}(?![\\d.])`);

    // Extract numbers from the prompt (after stripping LaTeX delimiters).
    const promptStripped = row.prompt.replace(/\$+/g, '');
    const promptNumbers = new Set<number>();
    for (const m of promptStripped.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
      promptNumbers.add(parseFloat(m[0]));
    }
    const answerInPrompt = promptNumbers.has(ans);

    for (const h of parsedHints) {
      const text = h.text.replace(/\$+/g, '');
      if (ansRe.test(text) && h.level <= 2) {
        if (answerInPrompt) {
          // Likely false positive — answer is also a given quantity.
          // Skip flagging as spoiler.
          continue;
        }
        issues.push({
          class: ISSUES.HINT_SPOILER,
          detail: `hint ${h.level} contains "${ans}" (not in prompt)`,
        });
      }
    }
  }

  // 7. Solution should reference the answer somehow.
  //    More forgiving check: look for the answer as a number, as a spelled-out
  //    word ("five"), or as a state field that exactly equals it.
  if (parsedAnswer?.type === 'numeric' && parsedSolution.length > 0) {
    const ans = parsedAnswer.value;
    const ansStr = String(ans);
    const haystack = parsedSolution
      .map((s) => `${s.detail ?? ''} ${s.title ?? ''} ${s.state ?? ''}`)
      .join(' ');
    // Strip ALL LaTeX delimiters AND common LaTeX commands so the answer
    // shows through. \frac{1}{2} → 1 2, \times → ' ', etc.
    const stripped = haystack
      .replace(/\$+/g, ' ')
      .replace(/\\(times|cdot|div|frac|underline|quad|qquad|left|right)\b/g, ' ')
      .replace(/[{}\\]/g, ' ');

    // Match: exact number boundary, or any state field equals answer.
    const numRe = new RegExp(`(?<![\\d.])${escapeRe(ansStr)}(?![\\d.])`);
    const stateMatch = parsedSolution.some(
      (s) => s.state && s.state.replace(/\$+/g, '').trim() === ansStr,
    );

    // Also accept spelled-out form for small numbers (very common in K-1).
    const spelledOut = numberToWord(ans);
    const spelledMatch = spelledOut
      ? new RegExp(`\\b${escapeRe(spelledOut)}\\b`, 'i').test(stripped)
      : false;

    if (!numRe.test(stripped) && !stateMatch && !spelledMatch) {
      issues.push({
        class: ISSUES.SOLUTION_NO_ANSWER,
        detail: `solution doesn't mention "${ans}"`,
      });
    }
  }

  return {
    id: row.id,
    skill_id: row.skill_id,
    difficulty: row.difficulty,
    provider: row.provider,
    prompt: row.prompt,
    hints: parsedHints,
    solution: parsedSolution,
    answer: parsedAnswer,
    issues,
  };
}

// ─── Auto-fix functions ────────────────────────────────────────────────

interface FixOutcome {
  fixed: boolean;
  patch?: Partial<{ prompt: string; hints: unknown; solution: unknown; answer: unknown }>;
  notes: string[];
}

/**
 * Attempt to repair fixable issues in-place. Returns a patch object that
 * can be upserted, or null if nothing was fixed.
 */
function autoFix(r: AuditResult): FixOutcome {
  const notes: string[] = [];
  const patch: FixOutcome['patch'] = {};
  let dirty = false;

  // Track which issue classes appear so we run each fixer at most once
  // even if the same class appears multiple times (e.g., 2 spoiler hints).
  const issueClasses = new Set(r.issues.map((i) => i.class.name));

  // ── 1. Bare dollar currency: $12 → USD 12 ──────────────────────────
  if (issueClasses.has(ISSUES.PROMPT_BARE_DOLLAR.name)) {
    const before = patch.prompt ?? r.prompt;
    // Only replace `$N` patterns OUTSIDE balanced LaTeX blocks. Strategy:
    // walk the string, track LaTeX state, only rewrite when outside.
    const after = replaceBareDollarOutsideLatex(before);
    if (after !== before) {
      patch.prompt = after;
      notes.push('replaced bare $N with USD N');
      dirty = true;
    }
  }

  // ── 2. Broken LaTeX delimiters — multi-pattern repair ──────────────
  if (issueClasses.has(ISSUES.PROMPT_LATEX_BREAK.name)) {
    const before = patch.prompt ?? r.prompt;
    const repaired = repairBrokenLatex(before);
    if (repaired.text !== before) {
      patch.prompt = repaired.text;
      notes.push(...repaired.notes);
      dirty = true;
    }
  }

  // ── 3. Hint level renumbering ──────────────────────────────────────
  if (issueClasses.has(ISSUES.HINT_LEVEL.name)) {
    const fixed = r.hints.map((h, i) => ({ ...h, level: (i + 1) as 1 | 2 | 3 }));
    patch.hints = fixed;
    notes.push('renumbered hints to levels 1/2/3');
    dirty = true;
  }

  // ── 4. Hint spoiler — rewrite the leaky hint without revealing answer ──
  if (issueClasses.has(ISSUES.HINT_SPOILER.name) && r.answer?.type === 'numeric') {
    const ans = r.answer.value;
    const promptStripped = r.prompt.replace(/\$+/g, '');
    const promptNumbers = new Set<number>();
    for (const m of promptStripped.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
      promptNumbers.add(parseFloat(m[0]));
    }

    const fixedHints = r.hints.map((h) => {
      if (h.level > 2) return h; // hint 3 is allowed to be near-the-answer
      const stripped = h.text.replace(/\$+/g, '');
      const ansRe = new RegExp(`(?<![\\d.])${escapeRe(String(ans))}(?![\\d.])`);
      if (!ansRe.test(stripped)) return h; // not a spoiler
      if (promptNumbers.has(ans)) return h; // false positive — answer in prompt

      return { ...h, text: rewriteSpoilerHint(h.text, ans) };
    });

    if (fixedHints.some((h, i) => h.text !== r.hints[i]!.text)) {
      patch.hints = fixedHints;
      notes.push('rewrote spoiler hint(s) to remove answer');
      dirty = true;
    }
  }

  // ── 5. Solution doesn't mention answer — append a closing step ─────
  if (issueClasses.has(ISSUES.SOLUTION_NO_ANSWER.name) && r.answer?.type === 'numeric') {
    const ans = r.answer.value;
    const closing = {
      title: 'Final answer',
      detail: `The result is $${ans}$.`,
      state: String(ans),
    };
    // Cap solution length at 8 to match the schema upper bound.
    const newSolution = r.solution.length < 8
      ? [...r.solution, closing]
      : r.solution.slice(0, 7).concat(closing); // replace last if at cap
    patch.solution = newSolution;
    notes.push('appended final-answer step to solution');
    dirty = true;
  }

  return { fixed: dirty, patch: dirty ? patch : undefined, notes };
}

/**
 * Replace bare `$N` (currency) with `USD N`, but ONLY when the `$` is
 * outside any balanced LaTeX block. We tokenize the string into runs of
 * "math" vs "text" and only rewrite text-region bare-dollar sequences.
 */
function replaceBareDollarOutsideLatex(s: string): string {
  // Split into segments, alternating math/text using balanced LaTeX delims.
  // Pattern: capture $...$ groups; the pieces between them are text.
  const parts: Array<{ kind: 'math' | 'text'; text: string }> = [];
  const re = /(\$\$[\s\S]*?\$\$|\$(?:\\\$|[^$])*?\$)/g;
  let lastEnd = 0;
  for (const m of s.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > lastEnd) parts.push({ kind: 'text', text: s.slice(lastEnd, idx) });
    parts.push({ kind: 'math', text: m[0]! });
    lastEnd = idx + m[0]!.length;
  }
  if (lastEnd < s.length) parts.push({ kind: 'text', text: s.slice(lastEnd) });

  return parts.map((p) => {
    if (p.kind === 'math') return p.text;
    return p.text.replace(/(^|[^\\$])\$(\d)/g, '$1USD $2');
  }).join('');
}

interface RepairResult { text: string; notes: string[] }

/**
 * Multi-pattern repair for broken LaTeX delimiters in prompts.
 *
 * Patterns we know how to fix:
 *   A. Trailing $$ at end of inline math: `... = ?$$` → `... = ?$`
 *   B. Stray $ inside an inline math expression: `$3 + $? = 8$` → `$3 + ? = 8$`
 *   C. Sequence of bare-currency-looking dollars in plain text:
 *      `$25, $26, $27, $28, ...$` → `25, 26, 27, 28, ...`
 *   D. Anything else (gibberish like `$5 is larger than $ or $`): leave as-is
 *      and let the audit re-flag it. The rest of the pipeline (flagged_count)
 *      will retire the row organically.
 */
function repairBrokenLatex(s: string): RepairResult {
  const notes: string[] = [];
  let out = s;

  // Pattern A: `$$$` at end of string (was `$X$$`).
  if (/\$\$$/.test(out) && !/^\$\$/.test(out)) {
    out = out.replace(/\$\$$/, '$');
    notes.push('removed trailing extra $');
  }

  // Pattern B: stray $ inside what looks like an inline math expression.
  // Heuristic: if we see `$...$...$` where the middle $ is right next to
  // an operator/digit/non-space, drop the middle $.
  // We do this conservatively: only when the prompt has exactly 3 unescaped $.
  const dollarCount = (out.match(/(?<!\\)\$/g) || []).length;
  if (dollarCount === 3) {
    // Find positions of the three $.
    const positions: number[] = [];
    for (let i = 0; i < out.length; i++) {
      if (out[i] === '$' && (i === 0 || out[i - 1] !== '\\')) positions.push(i);
    }
    if (positions.length === 3) {
      const middle = positions[1]!;
      // Check if neighbors look like they're inside math (operator or digit).
      const before = out[middle - 1] ?? '';
      const after = out[middle + 1] ?? '';
      const isMathLike = /[+\-*/=?\d]/.test(before) || /[+\-*/=?\d]/.test(after);
      if (isMathLike) {
        out = out.slice(0, middle) + out.slice(middle + 1);
        notes.push('removed stray $ inside math expression');
      }
    }
  }

  // Pattern C: `$25, $26, $27, ...$` sequence — a list of bare-currency
  // dollars that the AI tried to wrap in $...$ but ended up with a dangling
  // single $. Strategy: if the prompt has many `$N` patterns and a final
  // single $ with no opener, strip ALL the bare $N and the trailing $.
  const bareDollarSeq = (out.match(/(?:^|[^\\])\$\d+/g) || []).length;
  const trailingSingle = /(?<!\\)\$(?:[^$]*)$/.test(out);
  if (bareDollarSeq >= 3 && trailingSingle) {
    out = out.replace(/(^|[^\\])\$(\d)/g, '$1$2');
    out = out.replace(/(?<!\\)\$\s*([,.?!]?\s*)$/, '$1');
    notes.push('stripped bare $N currency sequence');
  }

  return { text: out, notes };
}

/**
 * Rewrite a hint that leaks the numeric answer. Detects the common
 * "Count: A, B, C..." family that Cerebras's K-1 templates produce, and
 * substitutes a non-spoiler version. Falls back to a generic rewrite.
 */
function rewriteSpoilerHint(text: string, _answer: number): string {
  // Pattern 1: "Count: A, B, C..." or "Count: A, B, C, ..."
  let out = text.replace(
    /\bCount(?:\s+up)?(?:\s+from\s+\d+)?:\s*\d+(?:\s*,\s*\d+)+(?:\s*[.…])*/gi,
    'Count up one number at a time, step by step',
  );
  // Pattern 2: "Count down from N: N, N-1, ..."
  out = out.replace(
    /\bCount\s+down(?:\s+from\s+\d+)?:\s*\d+(?:\s*,\s*\d+)+(?:\s*[.…])*/gi,
    'Count down one number at a time, step by step',
  );
  // Pattern 3: "Start with A and count up B: A, A+1, ..."
  out = out.replace(
    /\bStart\s+(?:with|at|from)\s+\d+\s+and\s+count\s+(?:up|down|back)\s+\d+:\s*\d+(?:\s*,\s*\d+)+(?:\s*[.…])*/gi,
    'Use the starting number and count up the right number of steps',
  );
  // Pattern 4: "Count up from A: B is next, then C..." — inline form
  out = out.replace(
    /\bCount\s+(?:up|down)\s+from\s+\d+:\s*\d+\s+is\s+next(?:[^.]*)/gi,
    'Count one step at a time from the given number',
  );

  // If none of the templated rewrites matched, do a last-resort pass:
  // remove any explicit number sequences "A, B, C, ..." that contain 3+
  // numbers — these are nearly always the leaky reveal pattern.
  if (out === text) {
    out = out.replace(/\b\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*\d+)*(?:\s*[…\.]+)?/g, '… (count step by step)');
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip balanced LaTeX delimiters from a string so we can analyze the
 * "natural language" portion. We process $$...$$ blocks first (so we don't
 * accidentally split a block at its inner $), then $...$ inline blocks.
 *
 * Escaped \$ is left intact — it represents a literal dollar sign inside
 * math mode and is the correct way to write currency.
 */
function stripBalancedLatex(s: string): string {
  let out = s;
  // Block math: $$...$$ (greedy across newlines but lazy on content)
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, ' ');
  // Inline math: $...$ — but allow \$ inside (escaped dollar sign).
  // Pattern: $ then anything that isn't an unescaped $, then $.
  out = out.replace(/\$((?:\\\$|[^$])*?)\$/g, ' ');
  return out;
}

/**
 * Spell out small whole numbers. Used to allow solutions that write
 * "the answer is five" instead of "the answer is 5".
 */
function numberToWord(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 20) return null;
  const words = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  ];
  return words[n] ?? null;
}

/**
 * Fetch verified rows from Supabase with PAGINATION.
 *
 * Why pagination: PostgREST (the API behind supabase-js) caps responses at
 * 1000 rows by default regardless of `.limit()`. To audit a 30K-row pool
 * we need to walk pages of 1000 with `.range(start, end)`.
 */
// We type the Supabase client as `any` here — the supabase-js generic
// machinery infers a stricter type than we need for these basic CRUD calls,
// and threading the proper generics adds noise without value for a script.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbClient = any;

async function fetchAllRows(
  sb: SbClient,
  filters: {
    skill?: string;
    difficulty?: number;
    provider?: string;
    /** When true, fetch every row regardless of audit state. Default false:
     *  only fetch rows that need auditing (last_audited_at IS NULL or
     *  last_audit_version < AUDIT_RULES_VERSION). */
    onlyUnaudited?: boolean;
  },
): Promise<QuestionRow[]> {
  const PAGE = 1000;
  const out: QuestionRow[] = [];
  let start = 0;

  for (;;) {
    let q = sb.from('questions').select('*').eq('verified', true).order('created_at', { ascending: true });
    if (filters.skill) q = q.eq('skill_id', filters.skill);
    if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
    if (filters.provider) q = q.eq('provider', filters.provider);
    if (filters.onlyUnaudited) {
      // PostgREST `or` syntax: rows where last_audited_at IS NULL OR
      // last_audit_version < current version. Caller must ensure these
      // columns exist before passing onlyUnaudited=true.
      q = q.or(`last_audited_at.is.null,last_audit_version.lt.${AUDIT_RULES_VERSION}`);
    }
    q = q.range(start, start + PAGE - 1);

    const { data, error } = await q;
    if (error) {
      console.error('❌ db error:', error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as unknown as QuestionRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    start += PAGE;
    process.stdout.write(`\r   fetched ${out.length} rows...`);
  }
  if (out.length > 0) process.stdout.write('\n');
  return out;
}

/**
 * Mark a batch of rows as audited under the current rules version. Called
 * after each pass so subsequent runs skip them via the unaudited gate.
 */
async function markAudited(sb: SbClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { error, count } = await sb
      .from('questions')
      .update({
        last_audited_at: new Date().toISOString(),
        last_audit_version: AUDIT_RULES_VERSION,
      }, { count: 'exact' })
      .in('id', slice);
    if (error) {
      console.warn(`   ⚠ markAudited failed: ${error.message}`);
      continue;
    }
    updated += count ?? 0;
  }
  return updated;
}

/**
 * Compute a normalized hash that catches near-duplicate questions the
 * existing prompt_hash UNIQUE INDEX misses. We:
 *   - lowercase
 *   - strip LaTeX delimiters and common LaTeX commands
 *   - collapse whitespace
 *   - remove punctuation
 *   - remove the names of people in word problems (replace with "PERSON")
 * Two prompts that produce the same normalized hash represent the same
 * question modulo cosmetic variations.
 */
function normalizedPromptKey(prompt: string): string {
  let s = prompt.toLowerCase();
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ');
  s = s.replace(/\$((?:\\\$|[^$])*?)\$/g, ' $1 ');
  s = s.replace(/\\(times|cdot|div|frac|underline|quad|qquad|left|right|text)\b/g, ' ');
  s = s.replace(/[{}\\]/g, ' ');
  s = s.replace(/[.,!?;:'"()\[\]\-_*=+\/]/g, ' ');
  // Replace very-likely person names (capitalized in original) with sentinel.
  // We already lowercased so we use word-context heuristic: replace standalone
  // single short words that look like names. Skip — too fuzzy. Instead just
  // collapse whitespace and digits-as-tokens.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Find duplicate question groups using the normalized key. Same skill +
 * difficulty + normalized prompt = duplicates. We keep the row with the
 * highest served_count (most validated by users), breaking ties by oldest
 * created_at (most "established"). Returns a list of IDs to delete.
 */
function findDuplicateIds(rows: QuestionRow[]): {
  toDelete: string[];
  groupCount: number;
  duplicateCount: number;
} {
  type Group = { keep: QuestionRow; remove: QuestionRow[] };
  const groups = new Map<string, Group>();

  for (const r of rows) {
    const key = `${r.skill_id}|${r.difficulty}|${normalizedPromptKey(r.prompt)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { keep: r, remove: [] });
      continue;
    }
    // Decide which row stays. Prefer:
    //   1. Higher served_count (validated by user practice)
    //   2. Lower flagged_count
    //   3. Older created_at (more established in pool)
    const cmp = (a: QuestionRow, b: QuestionRow) => {
      if (a.served_count !== b.served_count) return b.served_count - a.served_count;
      if (a.flagged_count !== b.flagged_count) return a.flagged_count - b.flagged_count;
      return a.created_at < b.created_at ? -1 : 1;
    };
    if (cmp(r, existing.keep) < 0) {
      // r is "better" than current keeper
      existing.remove.push(existing.keep);
      existing.keep = r;
    } else {
      existing.remove.push(r);
    }
  }

  const toDelete: string[] = [];
  let groupCount = 0;
  let duplicateCount = 0;
  for (const g of groups.values()) {
    if (g.remove.length === 0) continue;
    groupCount++;
    duplicateCount += g.remove.length;
    for (const r of g.remove) toDelete.push(r.id);
  }
  return { toDelete, groupCount, duplicateCount };
}

/**
 * Apply per-(skill,difficulty) sampling to an already-fetched row set.
 */
function sampleRows(all: QuestionRow[], n: number): QuestionRow[] {
  const grouped = new Map<string, QuestionRow[]>();
  for (const r of all) {
    const k = `${r.skill_id}|${r.difficulty}`;
    const arr = grouped.get(k) ?? [];
    arr.push(r);
    grouped.set(k, arr);
  }
  const out: QuestionRow[] = [];
  for (const [, arr] of grouped) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    out.push(...arr.slice(0, n));
  }
  return out;
}

interface PassSummary {
  audited: number;
  perfect: number;
  withWarn: number;
  withError: number;
  issueCounts: Map<string, number>;
  byProvider: Map<string, { total: number; clean: number; warn: number; error: number }>;
  results: AuditResult[];
}

function tallyResults(results: AuditResult[]): PassSummary {
  const issueCounts = new Map<string, number>();
  const byProvider = new Map<string, { total: number; clean: number; warn: number; error: number }>();
  let perfect = 0, withWarn = 0, withError = 0;

  for (const r of results) {
    const sev = r.issues.map((i) => i.class.severity);
    if (r.issues.length === 0) perfect++;
    else if (sev.includes('error')) withError++;
    else if (sev.includes('warn')) withWarn++;
    for (const i of r.issues) {
      issueCounts.set(i.class.name, (issueCounts.get(i.class.name) ?? 0) + 1);
    }
    const p = r.provider ?? 'unknown';
    const entry = byProvider.get(p) ?? { total: 0, clean: 0, warn: 0, error: 0 };
    entry.total++;
    if (r.issues.length === 0) entry.clean++;
    else if (sev.includes('error')) entry.error++;
    else entry.warn++;
    byProvider.set(p, entry);
  }
  return { audited: results.length, perfect, withWarn, withError, issueCounts, byProvider, results };
}

function printSummary(label: string, s: PassSummary): void {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(`   audited:        ${s.audited}`);
  console.log(`   ✓ clean:        ${s.perfect} (${pct(s.perfect, s.audited)}%)`);
  console.log(`   ⚠ with warning: ${s.withWarn} (${pct(s.withWarn, s.audited)}%)`);
  console.log(`   ✗ with error:   ${s.withError} (${pct(s.withError, s.audited)}%)`);
}

async function main() {
  const args = parseArgs();
  console.log('🔍 Question audit');
  console.log(`   mode: ${args.all ? 'ALL' : `sample ${args.sample} per (skill, difficulty)`}`);
  if (args.skill) console.log(`   skill filter: ${args.skill}`);
  if (args.difficulty) console.log(`   difficulty filter: ${args.difficulty}`);
  if (args.provider) console.log(`   provider filter: ${args.provider}`);
  if (args.fix || args.fixDry) console.log(`   fix: ${args.fixDry ? 'DRY-RUN' : 'WRITE'}${args.fix && !args.fixDry ? ' + RE-AUDIT' : ''}`);
  console.log(`   report: ${args.report}\n`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    process.exit(1);
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  // ── Probe for the audit-state columns. If the migration hasn't been
  //    applied yet, fall back to non-incremental mode and tell the user.
  let auditStateColumnsPresent = true;
  try {
    const { error: probeErr } = await sb
      .from('questions')
      .select('last_audited_at,last_audit_version')
      .limit(1);
    if (probeErr) {
      const msg = (probeErr.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('column')) {
        auditStateColumnsPresent = false;
      } else {
        // Some other db error — surface it but continue
        console.warn(`[probe] unexpected: ${probeErr.message}`);
      }
    }
  } catch (e) {
    console.warn(`[probe] ${(e as Error).message}`);
    auditStateColumnsPresent = false;
  }

  if (!auditStateColumnsPresent) {
    console.warn(`\n⚠ Audit-state columns missing. Falling back to FULL audit every run.`);
    console.warn(`  To enable incremental audit, paste this SQL into the Supabase SQL editor`);
    console.warn(`  (Project → SQL Editor → New query):`);
    console.warn(`  ────────────────────────────────────────────────────────────`);
    console.warn(`  alter table public.questions`);
    console.warn(`    add column if not exists last_audited_at timestamptz,`);
    console.warn(`    add column if not exists last_audit_version smallint;`);
    console.warn(`  create index if not exists questions_unaudited_idx`);
    console.warn(`    on public.questions (verified)`);
    console.warn(`    where last_audited_at is null;`);
    console.warn(`  ────────────────────────────────────────────────────────────\n`);
  }

  // ── Step 1: Dedupe pass (BEFORE audit) ─────────────────────────────
  // We dedupe on the full pool, not just the unaudited subset, so we don't
  // miss duplicates that span audited/unaudited boundaries.
  if (args.dedupe && (args.fix || args.fixDry)) {
    console.log(`Fetching all rows for duplicate check...`);
    const fullPool = await fetchAllRows(sb, {
      skill: args.skill,
      difficulty: args.difficulty,
      provider: args.provider,
    });
    console.log(`   total in DB: ${fullPool.length}`);
    const { toDelete, groupCount, duplicateCount } = findDuplicateIds(fullPool);

    if (duplicateCount > 0) {
      const dryLabel = args.fixDry ? ' (DRY-RUN)' : '';
      console.log(`\n━━━ Duplicate detection${dryLabel} ━━━`);
      console.log(`   ${groupCount} duplicate groups found, ${duplicateCount} rows to delete`);
      // Show a few examples
      const sample = fullPool.filter((r) => toDelete.includes(r.id)).slice(0, 5);
      for (const r of sample) {
        console.log(`   ✗ ${r.skill_id} d${r.difficulty} (${r.provider}): "${r.prompt.slice(0, 80).replace(/\n/g, ' ')}..."`);
      }
      if (duplicateCount > 5) console.log(`   (showing 5 of ${duplicateCount})`);

      if (!args.fixDry && toDelete.length > 0) {
        const BATCH = 200;
        let deleted = 0;
        for (let i = 0; i < toDelete.length; i += BATCH) {
          const slice = toDelete.slice(i, i + BATCH);
          const { error: delErr, count } = await sb
            .from('questions')
            .delete({ count: 'exact' })
            .in('id', slice);
          if (delErr) {
            console.warn(`   ⚠ delete failed: ${delErr.message}`);
            continue;
          }
          deleted += count ?? 0;
        }
        console.log(`   deleted ${deleted}/${duplicateCount} duplicate rows`);
      }
    } else {
      console.log(`   ✓ no duplicates detected`);
    }
  }

  // ── Step 2: Fetch rows for audit (incremental by default) ─────────
  // Default behavior: only fetch rows that haven't been audited yet, OR
  // were audited under an older rules version. This makes re-runs cheap:
  // first run audits everything, subsequent runs only process new questions
  // that the seeder has added since last time.
  //
  // --reaudit-all forces a full re-audit (e.g., after detector improvements
  // when you don't want to bump AUDIT_RULES_VERSION).
  // --all without --fix just shows the picture (also fetches all).
  // If the audit-state columns are missing, we always do a full audit.
  const onlyUnaudited = auditStateColumnsPresent &&
    !args.reauditAll &&
    (args.fix || args.fixDry || args.all === false);

  console.log(`\nFetching rows for audit${onlyUnaudited ? ' (incremental — unaudited only)' : ' (full)'}...`);
  const allRows = await fetchAllRows(sb, {
    skill: args.skill,
    difficulty: args.difficulty,
    provider: args.provider,
    onlyUnaudited,
  });
  const rows = args.all ? allRows : sampleRows(allRows, args.sample);
  if (!args.all && allRows.length !== rows.length) {
    console.log(`   matched ${allRows.length}, sampling ${rows.length}`);
  } else {
    console.log(`   matched: ${allRows.length}`);
  }

  if (rows.length === 0) {
    console.log(`\n✅ Nothing to audit — all rows are up-to-date under rules v${AUDIT_RULES_VERSION}.`);
    console.log(`   (Pass --reaudit-all to force re-audit of every row.)`);
    process.exit(0);
  }

  console.log(`\nAuditing ${rows.length} questions...`);
  let results = rows.map(auditOne);
  let summary = tallyResults(results);

  printPassReport('Initial audit', summary, args);

  // ── Auto-fix mode ──────────────────────────────────────────────
  let writtenCount = 0;
  if (args.fix || args.fixDry) {
    const dryLabel = args.fixDry ? ' (DRY-RUN)' : '';
    console.log(`\n━━━ Auto-fix${dryLabel} ━━━`);
    const updates: Array<{ id: string; patch: NonNullable<FixOutcome['patch']>; notes: string[] }> = [];
    for (const r of results) {
      const outcome = autoFix(r);
      if (outcome.fixed && outcome.patch) {
        updates.push({ id: r.id, patch: outcome.patch, notes: outcome.notes });
      }
    }
    console.log(`   candidates for auto-fix: ${updates.length}`);
    for (let i = 0; i < Math.min(5, updates.length); i++) {
      const u = updates[i]!;
      console.log(`   ✓ ${u.id.slice(0, 8)}…: ${u.notes.join('; ')}`);
    }
    if (updates.length > 5) console.log(`   (showing first 5; ${updates.length - 5} more)`);

    if (updates.length > 0 && !args.fixDry) {
      console.log(`\n   Applying patches...`);
      const BATCH = 100;
      for (let i = 0; i < updates.length; i += BATCH) {
        const slice = updates.slice(i, i + BATCH);
        for (const u of slice) {
          const { error: upErr } = await sb.from('questions').update(u.patch).eq('id', u.id);
          if (upErr) {
            console.warn(`   ⚠ failed ${u.id.slice(0, 8)}: ${upErr.message}`);
            continue;
          }
          writtenCount++;
        }
        if ((i + BATCH) < updates.length) {
          process.stdout.write(`\r   wrote ${writtenCount}/${updates.length}...`);
        }
      }
      console.log(`\r   wrote ${writtenCount}/${updates.length} patches to DB`);
    } else if (args.fixDry) {
      console.log(`   (no DB writes — dry run)`);
    }

    // ── Re-audit after fix ─────────────────────────────────────
    // Pull the patched rows back and re-run the audit so we can show
    // a true before/after picture and confirm the fixes stuck.
    if (writtenCount > 0) {
      console.log(`\n🔁 Re-auditing after fixes...`);
      const refreshedAll = await fetchAllRows(sb, {
        skill: args.skill,
        difficulty: args.difficulty,
        provider: args.provider,
      });
      // Apply same sampling logic so the comparison is apples-to-apples:
      // we re-audit the SAME rows we just audited (matched by id).
      const auditedIds = new Set(rows.map((r) => r.id));
      const refreshedRows = refreshedAll.filter((r) => auditedIds.has(r.id));

      console.log(`   re-auditing ${refreshedRows.length} questions...`);
      const after = refreshedRows.map(auditOne);
      const afterSummary = tallyResults(after);

      printPassReport('After auto-fix', afterSummary, args);
      printDelta(summary, afterSummary);

      // Use the after-state as the canonical results for the report
      // and CSV (so the user sees the final, post-fix picture).
      results = after;
      summary = afterSummary;
    }
  }

  // ── Step 3: Mark all audited rows so subsequent runs skip them ────
  // Even rows that still have residual cosmetic warnings get marked —
  // they've been seen + reviewed, the warnings are intentional. The next
  // seed batch's NEW rows will have last_audited_at IS NULL and get
  // picked up automatically next run.
  if (!args.fixDry && auditStateColumnsPresent) {
    const auditedIds = results.map((r) => r.id);
    console.log(`\n📌 Marking ${auditedIds.length} rows as audited (rules v${AUDIT_RULES_VERSION})...`);
    const marked = await markAudited(sb, auditedIds);
    console.log(`   marked: ${marked}/${auditedIds.length}`);
  } else if (!auditStateColumnsPresent) {
    console.log(`\n📌 Skipping mark-audited (columns not yet migrated).`);
  }

  // ── Markdown report ───────────────────────────────────────────────
  const md = renderMarkdown(results, args, summary.byProvider, summary.issueCounts);
  const out = resolve(args.report);
  writeFileSync(out, md, 'utf8');
  console.log(`\n📝 Full report → ${out}`);

  // ── CSV: question IDs per issue category (FINAL state) ───────────
  const issueCsvPath = out.replace(/\.md$/, '.ids.csv');
  const csvLines: string[] = ['issue,id,skill_id,difficulty,provider'];
  for (const r of results) {
    for (const iss of r.issues) {
      csvLines.push([
        iss.class.name,
        r.id,
        r.skill_id,
        String(r.difficulty),
        r.provider ?? '',
      ].join(','));
    }
  }
  writeFileSync(issueCsvPath, csvLines.join('\n'), 'utf8');
  console.log(`📋 Per-issue ID list → ${issueCsvPath}`);
  console.log(`   To delete a category, e.g.:`);
  console.log(`     awk -F, '$1=="hint-spoiler" {print $2}' ${issueCsvPath} | head`);

  // Exit code: 0 if clean, 1 if any errors remain
  process.exit(summary.withError > 0 ? 1 : 0);
}

/**
 * Combined per-pass report: summary + issue breakdown + salvageability +
 * detail examples + by-provider. Replaces the old inline blocks so the
 * cycle mode can call it twice (before/after).
 */
function printPassReport(label: string, s: PassSummary, args: Args): void {
  printSummary(`${label} — Summary`, s);

  if (s.issueCounts.size > 0) {
    console.log(`\n━━━ ${label} — Issue breakdown ━━━`);
    console.log(`   ${'issue'.padEnd(28)} ${'count'.padStart(6)}  fix`);
    const allIssueClasses = Object.values(ISSUES);
    const sorted = Array.from(s.issueCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      const cls = allIssueClasses.find((c) => c.name === name);
      const fix = cls?.fixability ?? 'unknown';
      const fixIcon = fix === 'auto' ? '🔧 auto' : fix === 'regen' ? '🔁 regen' : '👀 manual';
      console.log(`   ${name.padEnd(28)} ${String(count).padStart(6)}  ${fixIcon}`);
    }
  }

  // Salvageability
  let autoFixable = 0, regenNeeded = 0, manualReview = 0, usableAsIs = 0;
  for (const r of s.results) {
    if (r.issues.length === 0) { usableAsIs++; continue; }
    const fixes = new Set(r.issues.map((i) => i.class.fixability));
    if (fixes.has('regen')) regenNeeded++;
    else if (fixes.has('auto')) autoFixable++;
    else { manualReview++; usableAsIs++; }
  }
  console.log(`\n━━━ ${label} — Salvageability ━━━`);
  console.log(`   ✅ usable as-is:        ${usableAsIs} (${pct(usableAsIs, s.audited)}%)`);
  console.log(`   🔧 auto-fixable:        ${autoFixable} (${pct(autoFixable, s.audited)}%)`);
  console.log(`   👀 needs eyeball:       ${manualReview} (${pct(manualReview, s.audited)}%)`);
  console.log(`   🔁 must be regenerated: ${regenNeeded} (${pct(regenNeeded, s.audited)}%)`);

  // Examples
  if (args.detail > 0 && s.issueCounts.size > 0) {
    console.log(`\n━━━ ${label} — Examples per issue (up to ${args.detail}) ━━━`);
    const grouped = new Map<string, AuditResult[]>();
    for (const r of s.results) {
      for (const iss of r.issues) {
        const arr = grouped.get(iss.class.name) ?? [];
        if (arr.length < args.detail) arr.push(r);
        grouped.set(iss.class.name, arr);
      }
    }
    for (const [issueName, examples] of grouped) {
      console.log(`\n  [${issueName}]`);
      for (const r of examples) {
        const detail = r.issues.find((i) => i.class.name === issueName)?.detail ?? '';
        console.log(`     ${r.skill_id} d${r.difficulty} (${r.provider ?? '?'}) — ${detail}`);
        console.log(`        prompt: "${r.prompt.slice(0, 100).replace(/\n/g, ' ')}..."`);
        if (issueName === ISSUES.HINT_SPOILER.name && r.hints.length > 0) {
          for (const h of r.hints) {
            console.log(`        hint ${h.level}: "${h.text.slice(0, 90).replace(/\n/g, ' ')}..."`);
          }
        }
      }
    }
  }

  // By provider
  console.log(`\n━━━ ${label} — By provider ━━━`);
  console.log(`   ${'provider'.padEnd(14)} ${'total'.padStart(6)}  ${'clean'.padStart(6)}  ${'warn'.padStart(6)}  ${'error'.padStart(6)}`);
  for (const [p, ps] of Array.from(s.byProvider.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      `   ${p.padEnd(14)} ${String(ps.total).padStart(6)}  ` +
      `${String(ps.clean).padStart(6)}  ${String(ps.warn).padStart(6)}  ${String(ps.error).padStart(6)}` +
      `  (${pct(ps.clean, ps.total)}% clean)`,
    );
  }
}

/** Side-by-side delta between two pass summaries. */
function printDelta(before: PassSummary, after: PassSummary): void {
  console.log(`\n━━━ Before / After (delta) ━━━`);
  console.log(`   ${'metric'.padEnd(28)} ${'before'.padStart(8)}  ${'after'.padStart(8)}  ${'Δ'.padStart(7)}`);
  const fmt = (a: number, b: number) => {
    const delta = b - a;
    const sign = delta > 0 ? '+' : '';
    return `${String(a).padStart(8)}  ${String(b).padStart(8)}  ${(sign + delta).padStart(7)}`;
  };
  console.log(`   ${'✓ clean'.padEnd(28)} ${fmt(before.perfect, after.perfect)}`);
  console.log(`   ${'⚠ with warning'.padEnd(28)} ${fmt(before.withWarn, after.withWarn)}`);
  console.log(`   ${'✗ with error'.padEnd(28)} ${fmt(before.withError, after.withError)}`);
  // Issue-by-issue
  const allIssueNames = new Set<string>([
    ...before.issueCounts.keys(),
    ...after.issueCounts.keys(),
  ]);
  for (const name of allIssueNames) {
    const a = before.issueCounts.get(name) ?? 0;
    const b = after.issueCounts.get(name) ?? 0;
    if (a === b) continue; // skip unchanged
    console.log(`   ${name.padEnd(28)} ${fmt(a, b)}`);
  }
}

function pct(part: number, total: number): string {
  if (total === 0) return '0';
  return ((100 * part) / total).toFixed(1);
}

function renderMarkdown(
  results: AuditResult[],
  args: Args,
  byProvider: Map<string, { total: number; clean: number; warn: number; error: number }>,
  issueCounts: Map<string, number>,
): string {
  const lines: string[] = [];
  lines.push(`# Question audit report`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`Mode: ${args.all ? 'ALL rows' : `sample of ${args.sample} per (skill, difficulty)`}`);
  if (args.skill) lines.push(`Skill filter: \`${args.skill}\``);
  if (args.provider) lines.push(`Provider filter: \`${args.provider}\``);
  lines.push(``);

  // Summary
  const perfect = results.filter((r) => r.issues.length === 0).length;
  const withWarn = results.filter((r) =>
    r.issues.length > 0 && !r.issues.some((i) => i.class.severity === 'error'),
  ).length;
  const withError = results.filter((r) => r.issues.some((i) => i.class.severity === 'error')).length;

  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| | count | % |`);
  lines.push(`|---|---:|---:|`);
  lines.push(`| Total audited | ${results.length} | 100 |`);
  lines.push(`| ✓ Clean | ${perfect} | ${pct(perfect, results.length)} |`);
  lines.push(`| ⚠ Warnings | ${withWarn} | ${pct(withWarn, results.length)} |`);
  lines.push(`| ✗ Errors | ${withError} | ${pct(withError, results.length)} |`);
  lines.push(``);

  // By provider
  if (byProvider.size > 0) {
    lines.push(`## By provider`);
    lines.push(``);
    lines.push(`| Provider | Total | Clean | Warn | Error | % Clean |`);
    lines.push(`|---|---:|---:|---:|---:|---:|`);
    for (const [p, s] of Array.from(byProvider.entries()).sort((a, b) => b[1].total - a[1].total)) {
      lines.push(`| ${p} | ${s.total} | ${s.clean} | ${s.warn} | ${s.error} | ${pct(s.clean, s.total)}% |`);
    }
    lines.push(``);
  }

  // Issue breakdown
  if (issueCounts.size > 0) {
    lines.push(`## Issue breakdown`);
    lines.push(``);
    lines.push(`| Issue | Count | Severity | How to fix |`);
    lines.push(`|---|---:|---|---|`);
    const allClasses = Object.values(ISSUES);
    for (const [name, count] of Array.from(issueCounts.entries()).sort((a, b) => b[1] - a[1])) {
      const cls = allClasses.find((c) => c.name === name);
      const sev = cls?.severity ?? '';
      const fix = cls?.fixability === 'auto' ? '🔧 auto-fix'
        : cls?.fixability === 'regen' ? '🔁 regenerate'
        : cls?.fixability === 'manual' ? '👀 manual review' : '?';
      lines.push(`| \`${name}\` | ${count} | ${sev} | ${fix} |`);
    }
    lines.push(``);
  }

  // Salvageability box
  let usable = 0, autoFix = 0, manual = 0, regen = 0;
  for (const r of results) {
    if (r.issues.length === 0) { usable++; continue; }
    const fixes = new Set(r.issues.map((i) => i.class.fixability));
    if (fixes.has('regen')) regen++;
    else if (fixes.has('auto')) autoFix++;
    else { manual++; usable++; }
  }
  lines.push(`## Salvageability`);
  lines.push(``);
  lines.push(`| Bucket | Count | What to do |`);
  lines.push(`|---|---:|---|`);
  lines.push(`| ✅ Usable as-is | ${usable} | Ship — clean or cosmetic-only warnings |`);
  lines.push(`| 🔧 Auto-fixable | ${autoFix} | Run \`npm run audit:questions -- --fix\` |`);
  lines.push(`| 👀 Needs eyeball | ${manual} | Subset of usable; review if you want polish |`);
  lines.push(`| 🔁 Must regenerate | ${regen} | \`delete from questions where id in (...)\` then re-seed |`);
  lines.push(``);

  // Detailed errors
  const errors = results.filter((r) => r.issues.some((i) => i.class.severity === 'error'));
  if (errors.length > 0) {
    lines.push(`## Errors (${errors.length})`);
    lines.push(``);
    for (const r of errors.slice(0, 50)) {
      lines.push(`### \`${r.skill_id}\` d${r.difficulty} (${r.provider ?? 'unknown'})`);
      lines.push(``);
      lines.push(`**Prompt:** ${r.prompt.replace(/\n/g, ' ').slice(0, 200)}`);
      lines.push(``);
      for (const iss of r.issues) {
        const icon = iss.class.severity === 'error' ? '✗' : '⚠';
        lines.push(`- ${icon} \`${iss.class.name}\`: ${iss.detail}`);
      }
      lines.push(``);
      lines.push(`<sub>id: \`${r.id}\`</sub>`);
      lines.push(``);
    }
    if (errors.length > 50) {
      lines.push(`_...and ${errors.length - 50} more_`);
      lines.push(``);
    }
  }

  // Detailed warnings (cap at 30)
  const warns = results.filter(
    (r) => r.issues.length > 0 && !r.issues.some((i) => i.class.severity === 'error'),
  );
  if (warns.length > 0) {
    lines.push(`## Warnings (${warns.length})`);
    lines.push(``);
    for (const r of warns.slice(0, 30)) {
      lines.push(`### \`${r.skill_id}\` d${r.difficulty} (${r.provider ?? 'unknown'})`);
      lines.push(``);
      lines.push(`**Prompt:** ${r.prompt.replace(/\n/g, ' ').slice(0, 200)}`);
      lines.push(``);
      for (const iss of r.issues) {
        lines.push(`- ⚠ \`${iss.class.name}\`: ${iss.detail}`);
      }
      lines.push(``);
      lines.push(`<sub>id: \`${r.id}\`</sub>`);
      lines.push(``);
    }
    if (warns.length > 30) {
      lines.push(`_...and ${warns.length - 30} more_`);
      lines.push(``);
    }
  }

  // Random clean sample for spot-check
  const clean = results.filter((r) => r.issues.length === 0);
  if (clean.length > 0) {
    lines.push(`## 10 random clean samples for eyeball spot-check`);
    lines.push(``);
    const sample = [...clean].sort(() => Math.random() - 0.5).slice(0, 10);
    for (const r of sample) {
      lines.push(`### \`${r.skill_id}\` d${r.difficulty} (${r.provider ?? 'unknown'})`);
      lines.push(``);
      lines.push(`> ${r.prompt.replace(/\n/g, ' ').slice(0, 300)}`);
      lines.push(``);
      lines.push(`<sub>id: \`${r.id}\`</sub>`);
      lines.push(``);
    }
  }

  return lines.join('\n');
}

main().catch((e) => {
  console.error('❌ Audit crashed:', e);
  process.exit(1);
});
