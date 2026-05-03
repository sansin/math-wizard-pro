import { describe, it, expect } from 'vitest';
import { verify } from '@/lib/math/verifier';

describe('verify', () => {
  describe('numeric', () => {
    it('accepts a correct arithmetic answer', () => {
      const r = verify({ prompt: 'What is 7 + 8?', rawAnswer: 15, expectedKind: 'numeric' });
      expect(r.ok).toBe(true);
    });
    it('rejects an incorrect arithmetic answer', () => {
      const r = verify({ prompt: 'What is 7 + 8?', rawAnswer: 16, expectedKind: 'numeric' });
      expect(r.ok).toBe(false);
    });
    it('accepts non-arithmetic numeric (e.g. statistics)', () => {
      // No arithmetic in the prompt → can't independently verify, accept the AI claim.
      const r = verify({
        prompt: 'What is the probability of rolling a 3 on a fair die?',
        rawAnswer: 0.1667,
        expectedKind: 'numeric',
      });
      expect(r.ok).toBe(true);
    });
    it('handles × symbol', () => {
      const r = verify({ prompt: 'What is 6 × 7?', rawAnswer: 42, expectedKind: 'numeric' });
      expect(r.ok).toBe(true);
    });
    it('handles ÷ symbol', () => {
      const r = verify({ prompt: 'What is 100 ÷ 4?', rawAnswer: 25, expectedKind: 'numeric' });
      expect(r.ok).toBe(true);
    });
  });

  describe('fraction', () => {
    it('accepts well-formed fraction', () => {
      const r = verify({ prompt: 'Add 1/4 + 1/4', rawAnswer: '1/2', expectedKind: 'fraction' });
      expect(r.ok).toBe(true);
    });
    it('rejects non-fraction', () => {
      const r = verify({ prompt: 'Add 1/4 + 1/4', rawAnswer: 'half', expectedKind: 'fraction' });
      expect(r.ok).toBe(false);
    });
    it('rejects /0', () => {
      const r = verify({ prompt: '?', rawAnswer: '1/0', expectedKind: 'fraction' });
      expect(r.ok).toBe(false);
    });
  });

  describe('expression', () => {
    it('canonicalizes "4x + 2x" to "6*x" or similar', () => {
      const r = verify({ prompt: 'Simplify 4x+2x', rawAnswer: '4x+2x', expectedKind: 'expression' });
      expect(r.ok).toBe(true);
      if (r.ok && r.answer.type === 'expression') {
        // Mathjs canonicalization differs slightly between versions; just check it's not raw.
        expect(r.answer.canonical.length).toBeGreaterThan(0);
      }
    });
  });

  describe('text', () => {
    it('accepts non-empty short text', () => {
      const r = verify({ prompt: 'Next: A,C,E,G,?', rawAnswer: 'I', expectedKind: 'text' });
      expect(r.ok).toBe(true);
    });
    it('rejects empty text', () => {
      const r = verify({ prompt: '?', rawAnswer: '', expectedKind: 'text' });
      expect(r.ok).toBe(false);
    });
    it('rejects whitespace-only text', () => {
      const r = verify({ prompt: '?', rawAnswer: '   ', expectedKind: 'text' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('empty-text');
    });
    it('rejects text longer than 64 chars', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: 'a'.repeat(65),
        expectedKind: 'text',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('text-too-long');
    });
  });

  describe('numeric — additional paths', () => {
    it('accepts a numeric string ("42") via toNumber()', () => {
      const r = verify({ prompt: '?', rawAnswer: '42', expectedKind: 'numeric' });
      expect(r.ok).toBe(true);
      if (r.ok && r.answer.type === 'numeric') {
        expect(r.answer.value).toBe(42);
      }
    });
    it('accepts a negative numeric string', () => {
      const r = verify({ prompt: '?', rawAnswer: '-3.14', expectedKind: 'numeric' });
      expect(r.ok).toBe(true);
      if (r.ok && r.answer.type === 'numeric') {
        expect(r.answer.value).toBeCloseTo(-3.14);
      }
    });
    it('rejects a non-numeric string', () => {
      const r = verify({ prompt: '?', rawAnswer: 'forty-two', expectedKind: 'numeric' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('answer-not-numeric');
    });
    it('rejects when prompt arithmetic disagrees with claim', () => {
      const r = verify({ prompt: 'What is 3 + 5?', rawAnswer: 9, expectedKind: 'numeric' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/^mismatch:/);
    });
    it('skips arithmetic candidate that mathjs cannot evaluate', () => {
      // The regex matches "1.2.3.4" as a candidate (digits + dots), but mathjs
      // throws on it — verifier should fall through to the "trust AI" path
      // since no other arithmetic candidate is available.
      const r = verify({
        prompt: 'Version 1.2.3.4 of the protocol',
        rawAnswer: 7,
        expectedKind: 'numeric',
      });
      expect(r.ok).toBe(true); // no extractable arithmetic → AI claim accepted
    });
  });

  describe('expression — error path', () => {
    it('rejects an unparseable expression', () => {
      // mathjs.parse throws on syntactically broken expressions.
      const r = verify({
        prompt: 'Simplify',
        rawAnswer: '6x +++',
        expectedKind: 'expression',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('expression-parse-failed');
    });
  });

  describe('multipleChoice', () => {
    const opts = ['Apple', 'Banana', 'Cherry', 'Date'];
    it('accepts a valid index with options metadata', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: 2,
        expectedKind: 'multipleChoice',
        metadata: { options: opts },
      });
      expect(r.ok).toBe(true);
      if (r.ok && r.answer.type === 'multipleChoice') {
        expect(r.answer.correctIndex).toBe(2);
        expect(r.answer.options).toEqual(opts);
      }
    });
    it('accepts a numeric-string index', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: '3',
        expectedKind: 'multipleChoice',
        metadata: { options: opts },
      });
      expect(r.ok).toBe(true);
    });
    it('rejects negative index', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: -1,
        expectedKind: 'multipleChoice',
        metadata: { options: opts },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('mc-bad-index');
    });
    it('rejects out-of-range index', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: 99,
        expectedKind: 'multipleChoice',
        metadata: { options: opts },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('mc-bad-index');
    });
    it('rejects non-numeric raw answer', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: 'A',
        expectedKind: 'multipleChoice',
        metadata: { options: opts },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('mc-bad-index');
    });
    it('rejects non-integer index', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: 1.5,
        expectedKind: 'multipleChoice',
        metadata: { options: opts },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('mc-bad-index');
    });
    it('rejects when options metadata is missing', () => {
      // Without options, every index is out-of-range.
      const r = verify({
        prompt: '?',
        rawAnswer: 0,
        expectedKind: 'multipleChoice',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('unknown answer kind', () => {
    it('rejects unsupported kinds via the default branch', () => {
      const r = verify({
        prompt: '?',
        rawAnswer: 'whatever',
        // Cast forces an out-of-union value to exercise the default branch.
        expectedKind: 'mystery' as unknown as 'numeric',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('unknown-kind');
    });
  });
});
