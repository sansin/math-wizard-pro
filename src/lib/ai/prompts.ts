/**
 * Prompt builders for question generation, hints, and solutions.
 *
 * Design philosophy:
 *   - Tightly scoped tasks. We never ask the AI to do more than one thing
 *     in a single request. Smaller asks → fewer hallucinations.
 *   - Strict JSON schemas. We give the AI an exact shape and reject
 *     anything that doesn't parse.
 *   - Bulk where possible. Generation requests ask for N questions at
 *     once, which slashes API calls when we only need 1 verified output.
 */

import type { GradeBand, Skill } from '@/types/core';

const SHARED_HEADER = `You are a math curriculum designer for an adaptive K-12 learning app called Math Wizard Pro. Generate questions that are:
- Mathematically correct (always double-check your arithmetic before finalizing).
- Age-appropriate and grade-aligned.
- Engaging and conversational (one sentence; story problems for younger kids).
- Use LaTeX for any math notation, surrounded by $...$ for inline.
- Strictly avoid simple "What is X + Y?" templates unless the skill is single-digit arithmetic.`;

export interface BatchPromptParams {
  skill: Skill;
  difficulty: 1 | 2 | 3 | 4 | 5;
  count: number;
  /** Recent prompt hashes from this user — never repeat. */
  avoidPromptHashes?: string[];
}

const ANSWER_KIND_GUIDE = `Each question's "answer" must be one of:
- {"type":"numeric","value":<number>,"tolerance":<number, optional>}
- {"type":"fraction","numerator":<int>,"denominator":<int>}
- {"type":"expression","canonical":"<simplified expression like '6x' or 'x^2'>"}
- {"type":"multipleChoice","correctIndex":<0-3>,"options":["A","B","C","D"]}
- {"type":"text","value":"<string>","caseSensitive":false}`;

export const QUESTION_BATCH_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['prompt', 'answer', 'hints', 'solution'],
        properties: {
          prompt: { type: 'string', minLength: 5, maxLength: 400 },
          answer: { type: 'object' },
          hints: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'object',
              required: ['level', 'text'],
              properties: {
                level: { type: 'integer', minimum: 1, maximum: 3 },
                text: { type: 'string', minLength: 5, maxLength: 280 },
              },
            },
          },
          solution: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['title', 'detail'],
              properties: {
                title: { type: 'string', maxLength: 100 },
                detail: { type: 'string', maxLength: 400 },
                state: { type: 'string', maxLength: 100 },
              },
            },
          },
        },
      },
    },
  },
  required: ['questions'],
} as const;

export function buildQuestionBatchPrompt(params: BatchPromptParams) {
  const { skill, difficulty, count, avoidPromptHashes } = params;
  const difficultyDescription = [
    'very easy — small numbers, single step',
    'easy — small numbers, one operation',
    'medium — typical example for the topic',
    'hard — multi-step or multi-concept',
    'challenging — pushes the upper edge of the grade band',
  ][difficulty - 1];

  const system = `${SHARED_HEADER}

${ANSWER_KIND_GUIDE}

Each question MUST include:
1. "prompt" — the question text (LaTeX OK).
2. "answer" — the verified correct answer using one of the schemas above. THIS FIELD MUST NEVER BE EMPTY; it must contain a "type" field and the variant's required fields.
3. "hints" — exactly 3 progressive hints. Hint 1 is a gentle nudge about the concept. Hint 2 suggests a strategy or sub-step. Hint 3 brings the student close to the answer WITHOUT stating it. None of the hints may reveal the final answer.
4. "solution" — 2-4 short steps showing how to reach the answer.

CONCRETE EXAMPLE of a single question (you must produce 5 like this):
{
  "prompt": "Mia has 35 stickers and gives 12 to Leo. How many does Mia have left?",
  "answer": {"type": "numeric", "value": 23},
  "hints": [
    {"level": 1, "text": "When you give some away, the total goes down — which operation does that?"},
    {"level": 2, "text": "Subtract: $35 - 12$. Take care of ones first, then tens."},
    {"level": 3, "text": "Ones: $5 - 2 = 3$. Tens: $3 - 1 = 2$. Combine the digits."}
  ],
  "solution": [
    {"title": "Identify the operation", "detail": "Giving away means we subtract."},
    {"title": "Compute", "detail": "$35 - 12 = 23$.", "state": "23"}
  ]
}

Constraints:
- Never use the same numbers or near-duplicate phrasings within a batch.
- Across the ${count} questions in this batch you MUST mix surface forms. Don't make every question a "Sara has X / Tom has X" word problem. Use:
  • a plain numeric problem (e.g. "$48 - 16 = ?$")
  • a word problem with a real-world context (cooking, sports, money, travel — vary them)
  • a comparison or "missing value" form (e.g. "$? + 16 = 48$" or "Which is larger: ...")
  • a "find the difference" or "complete the sequence" form
  • optionally a multipleChoice variant
- Real-world contexts must vary: don't repeat "stickers" or "cookies" or "marbles" within a batch. Try sports scores, time of day, money, distance, weights, ages, books read, plants in a garden — anything plausible for the grade.
- Names of people in word problems must vary across questions (don't reuse "Sara"/"Tom"/"Mia" for multiple).
- Every answer must be verifiable by simple arithmetic or symbolic computation.

CURRENCY (CRITICAL):
- NEVER write a bare \\$ for currency in the prompt. This collides with our LaTeX delimiter and breaks rendering.
- Instead, prefer: "USD 12" or "12 dollars" or "$\\\\$ 12$" (escaped LaTeX dollar inside math mode).
- For a word problem about money, use "USD" prefix or spell it out:
  - YES: "Karen has USD 12 more than..."
  - YES: "Karen has 12 dollars more than..."
  - NO:  "Karen has $12 more than..."   ← causes whitespace stripping in our renderer.

ALGEBRA / EQUATIONS:
- For algebra word problems, ALSO include the symbolic equation as block-level LaTeX at the end of the prompt, after the descriptive text. This helps students visualize the math.
- Example prompt: "Karen has 12 dollars more than twice what she had last week. If she has 26 dollars now, how much did she have last week? Let x be the amount she had last week. $$2x + 12 = 26$$"
- The equation goes inside $$ ... $$ (block math) at the END of the prompt, separated by a space.

OUTPUT FORMAT:
- Output must be a single JSON object: {"questions":[ {...}, {...}, ... ]}. No prose, no markdown fences.
- LaTeX inside JSON strings: use double backslashes (\\\\frac instead of \\frac), since JSON requires escaping the backslash.`;

  const avoidLine = avoidPromptHashes && avoidPromptHashes.length > 0
    ? `\nAvoid these prompt patterns (already shown to user): ${avoidPromptHashes.slice(0, 20).join(', ')}.`
    : '';

  const user = `Generate ${count} ${difficultyDescription} questions for this skill:
- Skill: "${skill.name}"
- Module: "${skill.module}" / Topic: "${skill.topic}"
- Grade band: ${skill.gradeBand}
- Standards: ${skill.standards?.join(', ') || 'general'}
${avoidLine}

Return JSON: {"questions":[{...}, {...}, ...]}.`;

  return { system, user, schema: QUESTION_BATCH_SCHEMA };
}

// ─── Hint refinement (used when stored hints feel generic) ─────────────
export function buildHintRefinePrompt(prompt: string, level: 1 | 2 | 3) {
  const tone = level === 1
    ? 'a gentle nudge about the underlying concept (no numbers from the problem)'
    : level === 2
    ? 'a strategy or sub-step the student should try'
    : 'a near-final hint that helps without giving the answer';

  const system = `You write progressive math hints for K-12 students. ${tone}. Never reveal the final answer. Reply with the hint text only — no preamble, no JSON, under 240 characters.`;
  const user = `Question: "${prompt}"\nWrite a hint at level ${level}.`;
  return { system, user };
}

// ─── Tutor chat ────────────────────────────────────────────────────────
export interface TutorContext {
  studentName: string;
  gradeBand: GradeBand;
  problem: string;
  studentMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'tutor'; text: string }>;
}

export function buildTutorPrompt(ctx: TutorContext) {
  const system = `You are a friendly, patient math tutor for ${ctx.studentName}, a ${ctx.gradeBand} student.

Rules:
- Use the Socratic method. Never give the answer outright.
- Ask one short question at a time. Wait for the student.
- If the student says "I don't know", gently break the problem down a step.
- Use simple, encouraging language. No jargon they wouldn't have learned yet.
- If they get something right, say so and build on it.
- Keep replies under 4 short sentences.`;

  const history = (ctx.conversationHistory ?? [])
    .map((t) => `${t.role === 'user' ? 'Student' : 'Tutor'}: ${t.text}`)
    .join('\n');

  const user = `Problem: ${ctx.problem}
${history ? `\nConversation so far:\n${history}\n` : ''}
Student's latest message: "${ctx.studentMessage}"

Reply as the tutor.`;

  return { system, user };
}
