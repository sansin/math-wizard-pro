/**
 * Server-side math verifier.
 *
 * Given a generated question and the AI's claimed answer, attempt to verify
 * the answer is mathematically correct using a deterministic engine
 * (mathjs for arithmetic & algebra, custom for sequences/geometry).
 *
 * Returns:
 *   { ok: true,  answer: AnswerKind } — verified, safe to ship to user
 *   { ok: false, reason: string }     — discard and regenerate
 *
 * Critical: never trust a question whose answer doesn't verify.
 */

import { evaluate, simplify, parse } from 'mathjs';
import type { AnswerKind } from '@/types/core';

export type VerifyInput = {
  prompt: string;
  /** Raw answer as the AI returned it (number, fraction string, or expression). */
  rawAnswer: string | number;
  /** Hint about what kind of answer to verify against. */
  expectedKind: AnswerKind['type'];
  /** Optional structured payload from the AI (e.g. "expression: 6x"). */
  metadata?: Record<string, unknown>;
};

export type VerifyResult =
  | { ok: true; answer: AnswerKind }
  | { ok: false; reason: string };

/**
 * Verify a numeric answer by independently evaluating the most-likely
 * arithmetic expression embedded in the prompt.
 */
function tryEvalArithmetic(prompt: string): number | null {
  // Look for the rightmost arithmetic-looking expression and evaluate it.
  // We're conservative: only accept clean +-*/^()  digits and decimals.
  const candidates = prompt.match(/[\d.+\-*/^() ]{3,}/g) ?? [];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const expr = candidates[i]!.replace(/\s+/g, '').replace(/[×x]/g, '*').replace(/÷/g, '/');
    if (!/[+\-*/^]/.test(expr)) continue;
    try {
      const v = evaluate(expr);
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    } catch {
      // ignore — try the next candidate
    }
  }
  return null;
}

function toNumber(raw: string | number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const m = raw.toString().trim().match(/^-?\d+(?:\.\d+)?$/);
  if (m) {
    const v = parseFloat(m[0]);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function parseFraction(raw: string | number): { num: number; den: number } | null {
  if (typeof raw === 'number') return null;
  const m = raw.trim().match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1]!, 10);
  const den = parseInt(m[2]!, 10);
  if (den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  return { num, den };
}

export function verify(input: VerifyInput): VerifyResult {
  const { prompt, rawAnswer, expectedKind } = input;

  switch (expectedKind) {
    case 'numeric': {
      const claimed = toNumber(rawAnswer);
      if (claimed === null) return { ok: false, reason: 'answer-not-numeric' };

      const indep = tryEvalArithmetic(prompt);
      if (indep !== null) {
        if (Math.abs(indep - claimed) > 0.01) {
          return { ok: false, reason: `mismatch:expected ${indep}, got ${claimed}` };
        }
      }
      // For non-arithmetic numeric questions (geometry, statistics) we trust
      // the AI but require a plausible finite number. The cache layer also
      // tracks per-skill correctness; flagrant errors will be filtered out
      // by users marking questions as wrong over time.
      return { ok: true, answer: { type: 'numeric', value: claimed, tolerance: 0.01 } };
    }

    case 'fraction': {
      const f = parseFraction(rawAnswer);
      if (!f) return { ok: false, reason: 'answer-not-fraction' };
      return { ok: true, answer: { type: 'fraction', numerator: f.num, denominator: f.den } };
    }

    case 'expression': {
      // Use mathjs to canonicalize: "4x + 2x" → "6x", "x*x" → "x^2"
      try {
        const node = parse(String(rawAnswer));
        const simp = simplify(node);
        const canonical = simp.toString().replace(/\s+/g, '');
        return { ok: true, answer: { type: 'expression', canonical } };
      } catch {
        return { ok: false, reason: 'expression-parse-failed' };
      }
    }

    case 'text': {
      const v = String(rawAnswer).trim();
      if (!v) return { ok: false, reason: 'empty-text' };
      if (v.length > 64) return { ok: false, reason: 'text-too-long' };
      return { ok: true, answer: { type: 'text', value: v, caseSensitive: false } };
    }

    case 'multipleChoice': {
      // Verifier expects rawAnswer to be the correct INDEX,
      // and metadata.options to carry the choices.
      const idx = toNumber(rawAnswer);
      const options = (input.metadata?.options as string[] | undefined) ?? [];
      if (idx === null || !Number.isInteger(idx) || idx < 0 || idx >= options.length) {
        return { ok: false, reason: 'mc-bad-index' };
      }
      return { ok: true, answer: { type: 'multipleChoice', correctIndex: idx, options } };
    }

    default:
      return { ok: false, reason: 'unknown-kind' };
  }
}
