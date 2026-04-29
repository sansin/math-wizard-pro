import { describe, it, expect } from 'vitest';
import { parseUserAnswer } from '@/lib/math/parser';

describe('parseUserAnswer', () => {
  describe('numeric', () => {
    it('parses plain integers', () => {
      expect(parseUserAnswer('42')).toMatchObject({ kind: 'numeric', value: 42 });
    });
    it('parses negative integers', () => {
      expect(parseUserAnswer('-7')).toMatchObject({ kind: 'numeric', value: -7 });
    });
    it('parses decimals', () => {
      expect(parseUserAnswer('3.14')).toMatchObject({ kind: 'numeric', value: 3.14 });
    });
    it('parses scientific notation', () => {
      expect(parseUserAnswer('1.5e2')).toMatchObject({ kind: 'numeric', value: 150 });
    });
    it('strips leading "= "', () => {
      expect(parseUserAnswer('= 42')).toMatchObject({ kind: 'numeric', value: 42 });
    });
    it('strips trailing units', () => {
      expect(parseUserAnswer('40cm')).toMatchObject({ kind: 'numeric', value: 40 });
      expect(parseUserAnswer('5 m')).toMatchObject({ kind: 'numeric', value: 5 });
    });
    it('strips surrounding parens', () => {
      expect(parseUserAnswer('(42)')).toMatchObject({ kind: 'numeric', value: 42 });
    });
  });

  describe('percent', () => {
    it('parses "50%" as 0.5', () => {
      expect(parseUserAnswer('50%')).toMatchObject({ kind: 'numeric', value: 0.5 });
    });
    it('parses "12.5%" as 0.125', () => {
      expect(parseUserAnswer('12.5%')).toMatchObject({ kind: 'numeric', value: 0.125 });
    });
  });

  describe('fractions', () => {
    it('parses "1/2"', () => {
      expect(parseUserAnswer('1/2')).toMatchObject({ kind: 'fraction', numerator: 1, denominator: 2, value: 0.5 });
    });
    it('parses "-3/4"', () => {
      expect(parseUserAnswer('-3/4')).toMatchObject({ kind: 'fraction', numerator: -3, denominator: 4, value: -0.75 });
    });
    it('rejects division by zero', () => {
      expect(parseUserAnswer('1/0')).toMatchObject({ kind: 'invalid', reason: 'division-by-zero' });
    });
  });

  describe('mixed fractions', () => {
    it('parses "1 1/2" as 1.5', () => {
      const p = parseUserAnswer('1 1/2');
      expect(p.kind).toBe('fraction');
      if (p.kind === 'fraction') {
        expect(p.value).toBe(1.5);
      }
    });
  });

  describe('text', () => {
    it('parses single letter (uppercased)', () => {
      expect(parseUserAnswer('a')).toMatchObject({ kind: 'text', value: 'A' });
    });
    it('parses short word answer', () => {
      expect(parseUserAnswer('triangle')).toMatchObject({ kind: 'text', value: 'triangle' });
    });
  });

  describe('invalid', () => {
    it('rejects empty', () => {
      expect(parseUserAnswer('')).toMatchObject({ kind: 'invalid', reason: 'empty' });
      expect(parseUserAnswer('   ')).toMatchObject({ kind: 'invalid', reason: 'empty' });
    });
    it('rejects garbage', () => {
      expect(parseUserAnswer('!!!@@@###')).toMatchObject({ kind: 'invalid' });
    });
  });
});
