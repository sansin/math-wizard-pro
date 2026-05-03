import { describe, it, expect } from 'vitest';
import { areEquivalent } from '@/lib/math/equivalence';

describe('areEquivalent', () => {
  describe('pure expressions', () => {
    it('treats syntactically identical expressions as equivalent', () => {
      expect(areEquivalent('6x', '6x')).toBe(true);
      expect(areEquivalent('x+2', 'x+2')).toBe(true);
    });

    it('simplifies before comparing', () => {
      expect(areEquivalent('4x + 2x', '6x')).toBe(true);
      expect(areEquivalent('2*3', '6')).toBe(true);
    });

    it('handles whitespace differences', () => {
      expect(areEquivalent('6 x', '6x')).toBe(true);
      expect(areEquivalent(' 4x + 2x ', '6x')).toBe(true);
    });

    it('handles Unicode operators', () => {
      expect(areEquivalent('4×x', '4x')).toBe(true);
      expect(areEquivalent('10÷2', '5')).toBe(true);
      expect(areEquivalent('5−2', '3')).toBe(true);
    });

    it('expands implicit multiplication for mathjs', () => {
      expect(areEquivalent('4x', '4*x')).toBe(true);
      expect(areEquivalent('2y + 3y', '5y')).toBe(true);
    });

    it('returns false for actually different expressions', () => {
      expect(areEquivalent('6x', '7x')).toBe(false);
      expect(areEquivalent('x+1', 'x-1')).toBe(false);
    });
  });

  describe('equations', () => {
    it('treats LHS=RHS and RHS=LHS as equivalent', () => {
      expect(areEquivalent('y = 6x', '6x = y')).toBe(true);
      expect(areEquivalent('a + 1 = 5', '5 = a + 1')).toBe(true);
    });

    it('treats sign-flipped equations as equivalent', () => {
      // 240 - 4x = y is the same as y = 240 - 4x is the same as y - 240 + 4x = 0
      expect(areEquivalent('240 - 4x = y', 'y = 240 - 4x')).toBe(true);
      expect(areEquivalent('y - 6x = 0', '6x - y = 0')).toBe(true);
    });

    it('treats commutatively-rearranged equations as equivalent', () => {
      // mathjs simplify normalizes term ordering, so these collapse to the
      // same canonical form even though the surface ordering differs.
      expect(areEquivalent('2x + 4 = 10', '4 + 2x = 10')).toBe(true);
      expect(areEquivalent('y = 6x + 3', 'y = 3 + 6x')).toBe(true);
    });

    it('does NOT treat scaled equations as equivalent', () => {
      // Symbolically distinct: getting from one to the other requires
      // multiplying both sides by a constant. Same solution set, but
      // areEquivalent intentionally only checks symbolic equivalence,
      // not solution-set equivalence (would need to solve, not simplify).
      expect(areEquivalent('2x + 4 = 10', 'x + 2 = 5')).toBe(false);
      expect(areEquivalent('2y = 6x', 'y = 3x')).toBe(false);
    });

    it('returns false for different equations', () => {
      expect(areEquivalent('y = 6x', 'y = 7x')).toBe(false);
      expect(areEquivalent('x = 5', 'x = 6')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false on unparseable inputs', () => {
      expect(areEquivalent('not math', '6')).toBe(false);
      expect(areEquivalent('6', 'still not math')).toBe(false);
    });

    it('handles empty inputs gracefully', () => {
      // mathjs treats empty as parse error → false
      expect(areEquivalent('', '0')).toBe(false);
    });
  });
});
