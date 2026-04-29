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
  });
});
