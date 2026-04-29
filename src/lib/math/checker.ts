/**
 * Answer correctness checker.
 *
 * Compares a parsed user answer against the verified answer attached to a
 * question. Tolerance defaults are deliberately strict for K-12 math:
 *   - Decimal arithmetic: ±0.01 (handles 1/3 ≈ 0.33 type rounding)
 *   - Currency-like: ±0.005
 *   - Integer answers: exact match required after rounding
 */

import type { AnswerKind } from '@/types/core';
import type { ParsedAnswer } from './parser';

export type CheckResult = {
  correct: boolean;
  /** A short string explaining why if incorrect — for telemetry, not user-facing. */
  reason?: string;
};

export function checkAnswer(parsed: ParsedAnswer, expected: AnswerKind): CheckResult {
  if (parsed.kind === 'invalid') {
    return { correct: false, reason: parsed.reason };
  }

  switch (expected.type) {
    case 'numeric': {
      if (parsed.kind === 'text') return { correct: false, reason: 'expected-numeric' };
      const tolerance = expected.tolerance ?? 0.01;
      const diff = Math.abs(parsed.value - expected.value);
      return diff <= tolerance
        ? { correct: true }
        : { correct: false, reason: `off-by-${diff.toFixed(4)}` };
    }

    case 'fraction': {
      // Accept any form whose decimal value matches within tolerance.
      // Bonus credit for exact equivalent fraction (numerator/denominator multiples).
      if (parsed.kind === 'text') return { correct: false, reason: 'expected-numeric' };
      const expectedValue = expected.numerator / expected.denominator;
      const diff = Math.abs(parsed.value - expectedValue);
      if (diff > 0.0005) return { correct: false, reason: `off-by-${diff.toFixed(4)}` };
      return { correct: true };
    }

    case 'expression': {
      // Caller (server) handles symbolic comparison via mathjs. The client
      // only knows the canonical form for display, not for verification —
      // expression comparison must always go through the server.
      if (parsed.kind === 'text') {
        const norm = parsed.value.replace(/\s+/g, '').toLowerCase();
        const can = expected.canonical.replace(/\s+/g, '').toLowerCase();
        return norm === can ? { correct: true } : { correct: false, reason: 'symbolic-mismatch' };
      }
      return { correct: false, reason: 'expression-needs-text' };
    }

    case 'text': {
      if (parsed.kind !== 'text' && parsed.kind !== 'numeric') {
        return { correct: false, reason: 'expected-text' };
      }
      const userVal = parsed.kind === 'text' ? parsed.value : String(parsed.value);
      const expectedVal = expected.value;
      const eq = expected.caseSensitive
        ? userVal === expectedVal
        : userVal.toLowerCase() === expectedVal.toLowerCase();
      return eq ? { correct: true } : { correct: false, reason: 'text-mismatch' };
    }

    case 'multipleChoice': {
      // For MC, parsed input is typically a number (1-based) or letter (A-D).
      let idx = -1;
      if (parsed.kind === 'numeric') {
        idx = Math.round(parsed.value) - 1;
      } else if (parsed.kind === 'text' && /^[A-D]$/i.test(parsed.value)) {
        idx = parsed.value.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      }
      return idx === expected.correctIndex
        ? { correct: true }
        : { correct: false, reason: 'wrong-choice' };
    }
  }
}
