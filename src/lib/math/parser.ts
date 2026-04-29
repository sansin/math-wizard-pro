/**
 * Math input parser for Math Wizard Pro.
 *
 * Goals:
 * - Robustly parse what kids actually type: "1/2", "1 1/2", "0.5", "50%",
 *   "1.5e2", trailing units, leading "= ", surrounding parentheses.
 * - Never silently coerce ambiguous input to 0 (a v1 bug).
 * - Return a discriminated union so callers can compare safely.
 *
 * Out of scope here: symbolic algebra (e.g. "6x"). That goes through
 * mathjs-based verification in verifier.ts.
 */

export type ParsedAnswer =
  | { kind: 'numeric'; value: number; raw: string }
  | { kind: 'fraction'; numerator: number; denominator: number; value: number; raw: string }
  | { kind: 'text'; value: string; raw: string }
  | { kind: 'invalid'; raw: string; reason: string };

const FRACTION = /^(-?)\s*(\d+)\s*\/\s*(\d+)$/;
const MIXED_FRACTION = /^(-?)\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/;
const PERCENT = /^(-?\d+(?:\.\d+)?)\s*%$/;
const NUMERIC = /^-?\d+(?:\.\d+)?(?:e-?\d+)?$/i;

/**
 * Strip user-input cruft: leading "= ", trailing units like "cm, m, %",
 * surrounding parentheses, surrounding whitespace.
 */
function preclean(raw: string): string {
  let s = raw.trim();
  if (!s) return s;
  s = s.replace(/^=\s*/, '');
  // Strip surrounding parens if they balance: (foo) -> foo, but leave (1)(2) alone.
  if (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let stripOk = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      if (depth === 0 && i < s.length - 1) {
        stripOk = false;
        break;
      }
    }
    if (stripOk) s = s.slice(1, -1).trim();
  }
  return s;
}

export function parseUserAnswer(raw: string): ParsedAnswer {
  const original = raw;
  const s = preclean(raw);

  if (!s) {
    return { kind: 'invalid', raw: original, reason: 'empty' };
  }

  // Percent — "50%" → numeric 0.5
  const percentMatch = s.match(PERCENT);
  if (percentMatch) {
    const value = parseFloat(percentMatch[1]!) / 100;
    if (Number.isFinite(value)) {
      return { kind: 'numeric', value, raw: original };
    }
  }

  // Mixed fraction — "1 1/2" → 1.5
  const mixedMatch = s.match(MIXED_FRACTION);
  if (mixedMatch) {
    const sign = mixedMatch[1] === '-' ? -1 : 1;
    const whole = parseInt(mixedMatch[2]!, 10);
    const num = parseInt(mixedMatch[3]!, 10);
    const den = parseInt(mixedMatch[4]!, 10);
    if (den === 0) return { kind: 'invalid', raw: original, reason: 'division-by-zero' };
    const value = sign * (whole + num / den);
    return {
      kind: 'fraction',
      numerator: sign * (whole * den + num),
      denominator: den,
      value,
      raw: original,
    };
  }

  // Simple fraction — "1/2"
  const fracMatch = s.match(FRACTION);
  if (fracMatch) {
    const sign = fracMatch[1] === '-' ? -1 : 1;
    const num = parseInt(fracMatch[2]!, 10);
    const den = parseInt(fracMatch[3]!, 10);
    if (den === 0) return { kind: 'invalid', raw: original, reason: 'division-by-zero' };
    return {
      kind: 'fraction',
      numerator: sign * num,
      denominator: den,
      value: (sign * num) / den,
      raw: original,
    };
  }

  // Strip trailing common units if it leaves a number: "8cm" -> "8"
  const unitStripped = s.replace(/\s*(cm|mm|m|km|in|ft|sq\s*cm|cm²|cm\^2)\s*$/i, '');
  if (NUMERIC.test(unitStripped)) {
    const value = parseFloat(unitStripped);
    if (Number.isFinite(value)) {
      return { kind: 'numeric', value, raw: original };
    }
  }

  // Plain number including scientific notation
  if (NUMERIC.test(s)) {
    const value = parseFloat(s);
    if (Number.isFinite(value)) {
      return { kind: 'numeric', value, raw: original };
    }
  }

  // Single letter or short symbol — for letter-pattern questions
  if (/^[A-Za-z]$/.test(s)) {
    return { kind: 'text', value: s.toUpperCase(), raw: original };
  }

  // Multi-word text (e.g. for word answers in K-1 picture mode)
  if (/^[A-Za-z][A-Za-z\s-]{0,30}$/.test(s)) {
    return { kind: 'text', value: s.trim(), raw: original };
  }

  // Algebraic expression — letters mixed with digits and basic operators.
  // We don't try to canonicalize here; the checker compares against the
  // server-canonicalized form (see verifier.ts → simplify()).
  if (/^[A-Za-z0-9+\-*/^()\s.]{1,80}$/.test(s) && /[A-Za-z]/.test(s)) {
    return { kind: 'text', value: s.replace(/\s+/g, ''), raw: original };
  }

  return { kind: 'invalid', raw: original, reason: 'unrecognized-format' };
}
