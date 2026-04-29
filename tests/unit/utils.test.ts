import { describe, it, expect } from 'vitest';
import { hash32, clamp, lerp, formatDuration, formatShortDate, cn } from '@/lib/utils';

describe('hash32', () => {
  it('is deterministic', () => {
    expect(hash32('hello world')).toBe(hash32('hello world'));
  });
  it('produces different hashes for different inputs', () => {
    expect(hash32('a')).not.toBe(hash32('b'));
  });
  it('produces alphanumeric base-36 output', () => {
    expect(hash32('test')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(20, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('returns endpoints at 0 and 1', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });
  it('returns midpoint at 0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
  it('clamps t', () => {
    expect(lerp(10, 20, -1)).toBe(10);
    expect(lerp(10, 20, 2)).toBe(20);
  });
});

describe('formatDuration', () => {
  it('formats sub-minute', () => {
    expect(formatDuration(45_000)).toBe('0:45');
  });
  it('formats over a minute', () => {
    expect(formatDuration(125_000)).toBe('2:05');
  });
  it('handles 0', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('formatShortDate', () => {
  it('returns Mon DD format', () => {
    expect(formatShortDate('2026-04-28T12:00:00.000Z')).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
  });
});

describe('cn', () => {
  it('merges tailwind classes correctly', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4'); // tailwind-merge dedupes
    expect(cn('text-sm', undefined, 'font-bold')).toContain('text-sm');
  });
});
