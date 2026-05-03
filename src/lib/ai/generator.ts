/**
 * Question generator — orchestrates the full generation flow:
 *
 *   1. Look up curated/cached questions for (skill, difficulty) first.
 *   2. If we don't have enough, batch-request N from the AI router.
 *   3. Verify each AI answer with the math engine (verifier.ts).
 *   4. Reject any that fail verification, regenerate up to MAX_RETRIES.
 *   5. Persist verified questions to the cache (server-side).
 *   6. Return them to the caller — verified and safe to ship.
 *
 * Cost control:
 *   - We always ask for a BATCH (default 5). One API call can fill
 *     ~10 minutes of practice for one student, then gets reused for
 *     other students.
 *   - We dedupe by promptHash before adding to the cache.
 */

import { z } from 'zod';
import { route, type RouterContext, type RouterOptions } from './router';
import { buildQuestionBatchPrompt } from './prompts';
import { verify } from '@/lib/math/verifier';
import { hash32 } from '@/lib/utils';
import type { Question, Skill, AnswerKind, Hint, SolutionStep, AIProviderId } from '@/types/core';

// ─── Schemas to validate AI output ─────────────────────────────────────
// Note: AI providers' structured-output modes have inconsistent type fidelity.
// Gemini in particular can return numbers as strings or nest extras. We use
// `z.coerce.number()` for numeric fields so "42" → 42 transparently.
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

const QuestionDraftSchema = z.object({
  prompt: z.string().min(5).max(500),
  answer: AnswerSchema,
  hints: z.array(HintSchema).length(3),
  solution: z.array(SolutionStepSchema).min(1).max(8),
});

const BatchSchema = z.object({
  questions: z.array(QuestionDraftSchema).min(1),
});

// ─── Types ─────────────────────────────────────────────────────────────
export interface GenerateBatchParams {
  skill: Skill;
  difficulty: 1 | 2 | 3 | 4 | 5;
  count?: number;
  avoidPromptHashes?: string[];
  /** Used for fallback — if we already have curated bank entries we may skip AI. */
  curatedFloor?: Question[];
}

export interface GenerateBatchResult {
  questions: Question[];
  generated: number;
  cached: number;
  rejected: number;
  attempts: Array<{ provider: string; source?: 'user' | 'admin'; ok: boolean; latencyMs?: number; error?: string }>;
}

const MAX_RETRIES = 1;

/** Strip ``` and ```json fences if the AI added them despite JSON mode. */
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

/**
 * AI providers (especially Cerebras Llama-3.1-8B and sometimes Gemini)
 * emit LaTeX inside JSON strings without escaping backslashes. Examples
 * we've seen in the wild:
 *
 *   "text": "Subtract: $48 \frac{1}{2}$"          ← \f valid JSON escape but breaks here
 *   "prompt": "$3 \times 10^5$ kilometers"         ← \t parses as TAB
 *   "text": "Add $\nu$ to the result"              ← \n parses as NEWLINE
 *   "text": "$\rho = m/V$"                         ← \r parses as CR
 *   "text": "Use $\sqrt{2}$"                       ← \s isn't a JSON escape
 *
 * The parser would either fail outright OR produce mangled content
 * (TAB inside the middle of words). Our heuristic: if a `\X` sequence
 * is followed by AT LEAST ONE more letter, it's a LaTeX command word
 * and should be double-escaped — even when X happens to be one of
 * \n \t \r \b \f. Single-letter escapes like a literal `\n` newline
 * are preserved because they're not followed by another letter.
 *
 * Special case: `\\` (already-doubled backslash) is left as-is so we
 * don't accidentally re-process correctly-escaped LaTeX.
 */
function fixLatexEscapes(s: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '"' && (i === 0 || s[i - 1] !== '\\')) inString = !inString;
    if (inString && c === '\\' && i + 1 < s.length) {
      const next = s[i + 1]!;
      // Skip already-escaped backslashes (`\\`).
      if (next === '\\') {
        out += '\\\\';
        i++; // consume the second \
        continue;
      }
      // Detect LaTeX commands: `\X` followed by another letter is almost
      // always a multi-letter command word like \times, \frac, \nu, \rho,
      // \alpha, \beta, \theta, \boxed, \underline, etc. Even when X is a
      // valid JSON escape character (n/t/r/b/f), the multi-letter pattern
      // means it's LaTeX, not a real JSON escape.
      const after = s[i + 2] ?? '';
      const looksLikeLatexCommand = /[A-Za-z]/.test(next) && /[A-Za-z]/.test(after);
      if (looksLikeLatexCommand) {
        out += '\\\\';
        continue;
      }
      // Lone `\X` where X is a letter not in valid JSON escapes — fix.
      // (\alpha, \sqrt — single letter, no follow-up letter; covered by
      // the previous branch already, this is the safety net.)
      const VALID_ESC = new Set(['n', 't', 'r', 'b', 'f', '"', "'", '/', 'u']);
      if (!VALID_ESC.has(next) && /[A-Za-z]/.test(next)) {
        out += '\\\\';
        continue;
      }
    }
    out += c;
  }
  return out;
}

function toQuestion(
  draft: z.infer<typeof QuestionDraftSchema>,
  skill: Skill,
  difficulty: 1 | 2 | 3 | 4 | 5,
  provider: string,
): Question | null {
  // Verify the AI's claimed answer matches the prompt.
  const expectedKind = draft.answer.type;
  const rawAnswer = (() => {
    switch (draft.answer.type) {
      case 'numeric': return draft.answer.value;
      case 'fraction': return `${draft.answer.numerator}/${draft.answer.denominator}`;
      case 'expression': return draft.answer.canonical;
      case 'multipleChoice': return draft.answer.correctIndex;
      case 'text': return draft.answer.value;
    }
  })();
  const metadata = draft.answer.type === 'multipleChoice'
    ? { options: draft.answer.options }
    : undefined;
  const verification = verify({
    prompt: draft.prompt,
    rawAnswer,
    expectedKind,
    metadata,
  });
  if (!verification.ok) {
    console.warn(`[generator] reject (${expectedKind}): ${verification.reason} | prompt="${draft.prompt.slice(0, 80)}" | rawAnswer=${JSON.stringify(rawAnswer)}`);
    return null;
  }

  return {
    id: crypto.randomUUID(),
    promptHash: hash32(draft.prompt),
    skillId: skill.id,
    difficulty,
    prompt: draft.prompt,
    answer: verification.answer as AnswerKind,
    hints: draft.hints as [Hint, Hint, Hint],
    solution: draft.solution as SolutionStep[],
    source: 'ai',
    provider: provider as Question['provider'],
    verified: true,
    createdAt: new Date().toISOString(),
  };
}

export async function generateBatch(
  params: GenerateBatchParams,
  ctx: RouterContext,
  routerOptions?: RouterOptions,
): Promise<GenerateBatchResult> {
  const count = params.count ?? 5;
  const built = buildQuestionBatchPrompt({
    skill: params.skill,
    difficulty: params.difficulty,
    count,
    avoidPromptHashes: params.avoidPromptHashes,
  });

  let attempts: GenerateBatchResult['attempts'] = [];
  const accepted: Question[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  // Providers that emitted unparseable JSON in this call. We exclude them
  // from subsequent retries inside this batch so we don't keep hammering
  // the same misbehaving model (e.g., Cerebras Llama 3.1 8B has known
  // LaTeX-in-JSON issues we've observed in production).
  const parseFailureExclude = new Set<AIProviderId>(routerOptions?.excluded ?? []);

  for (let retry = 0; retry <= MAX_RETRIES && accepted.length < count; retry++) {
    const need = count - accepted.length;
    // Merge the caller's exclusions with our running parse-failure set.
    const callerExcluded = routerOptions?.excluded ?? new Set<AIProviderId>();
    const mergedExcluded = new Set<AIProviderId>([...callerExcluded, ...parseFailureExclude]);

    const result = await route(
      {
        task: 'generate-batch',
        system: built.system,
        user: built.user,
        jsonSchema: built.schema as object,
        temperature: 0.85,
        // Each question costs ~600-1500 tokens with hints + solution + LaTeX.
        // Verbose skills (scientific notation, calculus, geometry proofs)
        // can produce questions toward the upper end. Bumped headroom
        // significantly — 2000 base + 1500 per question — to avoid
        // mid-JSON truncation that fails BatchSchema.parse.
        maxTokens: Math.min(12000, 2000 + need * 1500),
      },
      ctx,
      { ...routerOptions, excluded: mergedExcluded },
    );
    attempts = attempts.concat(result.attempts);

    let parsed: z.infer<typeof BatchSchema>;
    try {
      const raw = stripFences(result.response.content);
      // Try parsing as-is first, then with LaTeX-escape fixes if that fails.
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        const fixed = fixLatexEscapes(raw);
        json = JSON.parse(fixed);
      }
      parsed = BatchSchema.parse(json);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      // Common cause: response was truncated mid-JSON because the AI hit its
      // max-tokens limit. The detail "Unexpected end of JSON" or "Bad Unicode
      // escape" both fingerprint as truncation.
      const isTruncation = /Unexpected end|Bad Unicode|Unterminated string/i.test(detail);
      const errorClass = isTruncation ? 'parse-truncated' : 'parse-failed';
      console.warn(`[generator] ${errorClass}: ${detail.slice(0, 400)}`);
      console.warn(`[generator] raw AI content: ${stripFences(result.response.content).slice(0, 600)}`);
      // The router-level attempt was already pushed (HTTP succeeded).
      // Retroactively flip the most recent ok=true entry to ok=false with a
      // structured error so the API route can render a useful message instead
      // of "Tried 0 of N — all rate-limited".
      const lastOk = attempts.findLastIndex?.((a) => a.ok) ?? attempts
        .map((a, i) => (a.ok ? i : -1))
        .reverse()
        .find((i) => i >= 0) ?? -1;
      if (lastOk >= 0) {
        attempts[lastOk] = {
          ...attempts[lastOk]!,
          ok: false,
          error: errorClass,
        };
      }
      // Bench this provider for the rest of THIS call so we don't retry
      // into the same bad output. Caller-level health tracking (e.g.
      // seed-cache.ts's persistent bench) sees the failure too via the
      // attempts array we return.
      parseFailureExclude.add(result.response.provider as AIProviderId);
      rejected += need;
      continue;
    }

    for (const draft of parsed.questions) {
      if (accepted.length >= count) break;
      const q = toQuestion(draft, params.skill, params.difficulty, result.response.provider);
      if (!q) {
        rejected++;
        continue;
      }
      if (seen.has(q.promptHash)) {
        rejected++;
        continue;
      }
      seen.add(q.promptHash);
      accepted.push(q);
    }
  }

  return {
    questions: accepted,
    generated: accepted.length,
    cached: 0,
    rejected,
    attempts,
  };
}
