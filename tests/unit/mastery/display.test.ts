import { describe, it, expect } from 'vitest';
import {
  MASTERY_THRESHOLDS,
  isTouched,
  masteryBackgroundStyle,
  masteryLabel,
  masteryPercent,
} from '@/lib/mastery/display';

describe('masteryLabel', () => {
  it('returns "Just started" below the lowest threshold', () => {
    expect(masteryLabel(0)).toBe('Just started');
    expect(masteryLabel(0.05)).toBe('Just started');
    expect(masteryLabel(0.19999)).toBe('Just started');
  });

  it('returns "Learning" in the [0.20, 0.40) bracket', () => {
    expect(masteryLabel(0.20)).toBe('Learning');
    expect(masteryLabel(0.30)).toBe('Learning');
    expect(masteryLabel(0.39999)).toBe('Learning');
  });

  it('returns "Familiar" in the [0.40, 0.70) bracket', () => {
    expect(masteryLabel(0.40)).toBe('Familiar');
    expect(masteryLabel(0.55)).toBe('Familiar');
    expect(masteryLabel(0.69999)).toBe('Familiar');
  });

  it('returns "Solid" in the [0.70, 0.90) bracket', () => {
    expect(masteryLabel(0.70)).toBe('Solid');
    expect(masteryLabel(0.80)).toBe('Solid');
    expect(masteryLabel(0.89999)).toBe('Solid');
  });

  it('returns "Mastered" at or above the top threshold', () => {
    expect(masteryLabel(0.90)).toBe('Mastered');
    expect(masteryLabel(0.95)).toBe('Mastered');
    expect(masteryLabel(1.0)).toBe('Mastered');
  });

  it('exposes the thresholds as named constants for callers', () => {
    expect(MASTERY_THRESHOLDS.JUST_STARTED).toBe(0.20);
    expect(MASTERY_THRESHOLDS.LEARNING).toBe(0.40);
    expect(MASTERY_THRESHOLDS.FAMILIAR).toBe(0.70);
    expect(MASTERY_THRESHOLDS.SOLID).toBe(0.90);
  });
});

describe('masteryBackgroundStyle', () => {
  it('returns wizard-50 fill when selected and untouched', () => {
    const style = masteryBackgroundStyle(undefined, true);
    expect(style).toEqual({ background: '#F4F0FF' });
  });

  it('returns plain white when unselected and untouched', () => {
    const style = masteryBackgroundStyle(undefined, false);
    expect(style).toEqual({ background: '#FFFFFF' });
  });

  it('treats attempts=0 as untouched even with mastery > 0', () => {
    const style = masteryBackgroundStyle({ mastery: 0.5, attempts: 0 }, false);
    expect(style).toEqual({ background: '#FFFFFF' });
  });

  it('uses ember (warm red) fill for low mastery (<30%)', () => {
    const style = masteryBackgroundStyle({ mastery: 0.20, attempts: 5 }, false);
    expect(String(style?.background)).toContain('#FFE3DC');
  });

  it('uses spell (gold) fill for mid mastery (30%–70%)', () => {
    const style = masteryBackgroundStyle({ mastery: 0.50, attempts: 5 }, false);
    expect(String(style?.background)).toContain('#FFEEC2');
  });

  it('uses leaf (green) fill for high mastery (70%+)', () => {
    const style = masteryBackgroundStyle({ mastery: 0.85, attempts: 5 }, false);
    expect(String(style?.background)).toContain('#D4F2DD');
  });

  it('uses wizard-50 as the unfilled portion when selected', () => {
    const style = masteryBackgroundStyle({ mastery: 0.50, attempts: 5 }, true);
    expect(String(style?.background)).toContain('#F4F0FF');
  });

  it('uses white as the unfilled portion when unselected', () => {
    const style = masteryBackgroundStyle({ mastery: 0.50, attempts: 5 }, false);
    expect(String(style?.background)).toContain('#FFFFFF');
  });

  it('encodes the percentage in the gradient stops', () => {
    const style = masteryBackgroundStyle({ mastery: 0.42, attempts: 5 }, false);
    // 0.42 → 42 → "42%" appears in the linear-gradient string
    expect(String(style?.background)).toContain('42%');
  });

  it('clamps percentage to a 2-100 range so the fill is always visible', () => {
    // 0.001 → would round to 0; clamp to 2 so the colored band is at
    // least visible (signals "you have touched this, even barely").
    const style = masteryBackgroundStyle({ mastery: 0.001, attempts: 1 }, false);
    expect(String(style?.background)).toContain('2%');
  });
});

describe('masteryPercent', () => {
  it('returns null when untouched', () => {
    expect(masteryPercent(undefined)).toBeNull();
    expect(masteryPercent({ mastery: 0.5, attempts: 0 })).toBeNull();
  });

  it('returns rounded integer percentage for touched skills', () => {
    expect(masteryPercent({ mastery: 0.5, attempts: 1 })).toBe(50);
    expect(masteryPercent({ mastery: 0.456, attempts: 1 })).toBe(46);
    expect(masteryPercent({ mastery: 1.0, attempts: 1 })).toBe(100);
  });
});

describe('isTouched', () => {
  it('returns false for missing or zero-attempt entries', () => {
    expect(isTouched(undefined)).toBe(false);
    expect(isTouched({ mastery: 0.5, attempts: 0 })).toBe(false);
  });

  it('returns true for any positive attempt count', () => {
    expect(isTouched({ mastery: 0, attempts: 1 })).toBe(true);
    expect(isTouched({ mastery: 0.5, attempts: 30 })).toBe(true);
  });
});
