import { describe, it, expect } from 'vitest';
import { parseUserAnswer } from '@/lib/math/parser';
import { checkAnswer } from '@/lib/math/checker';
import type { AnswerKind } from '@/types/core';

describe('checkAnswer', () => {
  describe('numeric', () => {
    const expected: AnswerKind = { type: 'numeric', value: 42 };
    it('accepts exact match', () => {
      expect(checkAnswer(parseUserAnswer('42'), expected).correct).toBe(true);
    });
    it('accepts within default tolerance', () => {
      expect(checkAnswer(parseUserAnswer('42.005'), expected).correct).toBe(true);
    });
    it('rejects outside tolerance', () => {
      expect(checkAnswer(parseUserAnswer('43'), expected).correct).toBe(false);
    });
    it('respects custom tolerance', () => {
      expect(
        checkAnswer(parseUserAnswer('42.5'), { type: 'numeric', value: 42, tolerance: 1 }).correct,
      ).toBe(true);
    });
    it('accepts decimal equivalent of fraction', () => {
      expect(checkAnswer(parseUserAnswer('0.5'), { type: 'numeric', value: 0.5 }).correct).toBe(true);
      expect(checkAnswer(parseUserAnswer('1/2'), { type: 'numeric', value: 0.5 }).correct).toBe(true);
    });
    it('accepts percent equivalent', () => {
      expect(checkAnswer(parseUserAnswer('50%'), { type: 'numeric', value: 0.5 }).correct).toBe(true);
    });
  });

  describe('fraction', () => {
    const expected: AnswerKind = { type: 'fraction', numerator: 1, denominator: 4 };
    it('accepts equivalent decimal', () => {
      expect(checkAnswer(parseUserAnswer('0.25'), expected).correct).toBe(true);
    });
    it('accepts the fraction itself', () => {
      expect(checkAnswer(parseUserAnswer('1/4'), expected).correct).toBe(true);
    });
    it('accepts an equivalent fraction', () => {
      expect(checkAnswer(parseUserAnswer('2/8'), expected).correct).toBe(true);
    });
    it('rejects non-equivalent', () => {
      expect(checkAnswer(parseUserAnswer('1/3'), expected).correct).toBe(false);
    });
  });

  describe('text', () => {
    const expected: AnswerKind = { type: 'text', value: 'I', caseSensitive: false };
    it('accepts case-insensitive match', () => {
      expect(checkAnswer(parseUserAnswer('I'), expected).correct).toBe(true);
      expect(checkAnswer(parseUserAnswer('i'), expected).correct).toBe(true);
    });
    it('rejects different letter', () => {
      expect(checkAnswer(parseUserAnswer('J'), expected).correct).toBe(false);
    });
  });

  describe('multipleChoice', () => {
    const expected: AnswerKind = {
      type: 'multipleChoice',
      correctIndex: 2,
      options: ['Apple', 'Banana', 'Cherry', 'Date'],
    };
    it('accepts the right letter (C → index 2)', () => {
      expect(checkAnswer(parseUserAnswer('C'), expected).correct).toBe(true);
    });
    it('accepts the right number (3 → index 2)', () => {
      expect(checkAnswer(parseUserAnswer('3'), expected).correct).toBe(true);
    });
    it('rejects wrong letter', () => {
      expect(checkAnswer(parseUserAnswer('A'), expected).correct).toBe(false);
    });
  });

  describe('expression', () => {
    const expected: AnswerKind = { type: 'expression', canonical: '6x' };
    it('accepts canonical form (whitespace tolerant)', () => {
      expect(checkAnswer(parseUserAnswer('6x'), expected).correct).toBe(true);
      expect(checkAnswer(parseUserAnswer(' 6x '), expected).correct).toBe(true);
    });
    it('rejects different expression', () => {
      expect(checkAnswer(parseUserAnswer('5x'), expected).correct).toBe(false);
    });
  });
});
