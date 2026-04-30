/**
 * Symbolic equivalence for algebraic expressions and equations.
 *
 * Used by the answer checker to accept any form that is mathematically
 * equivalent to the expected answer — e.g.:
 *   "y = 240 - 4x"   ≡   "240 - 4x = y"
 *   "6x"             ≡   "4x + 2x"
 *   "x^2 + 2x + 1"   ≡   "(x+1)^2"
 *
 * Implementation: simplify each side, move equations to canonical
 * "LHS - RHS = 0" form, then check if the simplified expressions are
 * identical OR negations of each other.
 */

import { simplify, parse, type MathNode } from 'mathjs';

/** Pre-clean a user / AI-generated symbolic answer. */
function precleanSym(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '')
    // Common Unicode operators → ASCII
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')        // U+2212 minus → ASCII
    .replace(/(\d)([a-zA-Z])/g, '$1*$2'); // 4x → 4*x for mathjs
}

/** Try to parse `s` as a mathjs expression node. Returns null on failure. */
function safeParse(s: string): MathNode | null {
  try { return parse(s); } catch { return null; }
}

/** Simplify and stringify, returning a canonical form. */
function canonical(s: string): string | null {
  const node = safeParse(s);
  if (!node) return null;
  try {
    return simplify(node).toString().replace(/\s+/g, '');
  } catch {
    // Fall back to the raw parse stringify if simplify can't handle it.
    return node.toString().replace(/\s+/g, '');
  }
}

/**
 * If `s` is an equation (contains `=`), return its `LHS - RHS` form as a
 * single expression. Otherwise return `s` unchanged.
 */
function equationToZeroForm(s: string): string {
  s = precleanSym(s);
  const idx = s.indexOf('=');
  if (idx < 0) return s;
  const lhs = s.slice(0, idx);
  const rhs = s.slice(idx + 1);
  return `(${lhs})-(${rhs})`;
}

/**
 * Are two algebraic answers symbolically equivalent?
 *
 *   - Pure expressions: simplified canonical forms must be identical.
 *   - Equations: rewrite each as `LHS - RHS`, then check if their
 *     simplified forms differ only by an overall sign (so y=6x and 6x=y
 *     and 6x-y=0 and y-6x=0 are all accepted).
 */
export function areEquivalent(userAnswer: string, expectedAnswer: string): boolean {
  const a = equationToZeroForm(userAnswer);
  const b = equationToZeroForm(expectedAnswer);

  // Direct: simplify(a - b) == 0?
  const diff = canonical(`(${a})-(${b})`);
  if (diff === '0') return true;

  // Negation: simplify(a + b) == 0? (covers A=B vs B=A)
  const sum = canonical(`(${a})+(${b})`);
  if (sum === '0') return true;

  // Last-resort: just compare canonicals as strings (catches simple
  // re-orderings simplify already handled).
  const ca = canonical(a);
  const cb = canonical(b);
  if (ca && cb && ca === cb) return true;

  return false;
}
