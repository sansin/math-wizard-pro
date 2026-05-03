import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewModePref, __TEST_ONLY__ } from '@/hooks/useViewModePref';

const KEY = __TEST_ONLY__.STORAGE_KEY;

describe('useViewModePref', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to "grade" when nothing is stored', () => {
    const { result } = renderHook(() => useViewModePref());
    const [mode] = result.current;
    expect(mode).toBe('grade');
  });

  it('reads a previously-stored "module" value on mount', () => {
    window.localStorage.setItem(KEY, 'module');
    const { result } = renderHook(() => useViewModePref());
    // Hook reads in useEffect after mount → after renderHook returns,
    // the effect has already run.
    expect(result.current[0]).toBe('module');
  });

  it('falls back to default for an invalid stored value', () => {
    window.localStorage.setItem(KEY, 'something-else-entirely');
    const { result } = renderHook(() => useViewModePref());
    expect(result.current[0]).toBe('grade');
  });

  it('persists a new value via the setter', () => {
    const { result } = renderHook(() => useViewModePref());
    expect(result.current[0]).toBe('grade');
    act(() => {
      result.current[1]('module');
    });
    expect(result.current[0]).toBe('module');
    expect(window.localStorage.getItem(KEY)).toBe('module');
  });

  it('round-trips between values', () => {
    const { result } = renderHook(() => useViewModePref());
    act(() => result.current[1]('module'));
    expect(window.localStorage.getItem(KEY)).toBe('module');
    act(() => result.current[1]('grade'));
    expect(window.localStorage.getItem(KEY)).toBe('grade');
  });

  it('keeps state when storage write throws (e.g., quota exceeded)', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    try {
      const { result } = renderHook(() => useViewModePref());
      act(() => result.current[1]('module'));
      // Even though the write failed, the in-memory value should update.
      expect(result.current[0]).toBe('module');
    } finally {
      window.localStorage.setItem = original;
    }
  });
});

describe('isViewMode type guard', () => {
  it('accepts "grade" and "module"', () => {
    expect(__TEST_ONLY__.isViewMode('grade')).toBe(true);
    expect(__TEST_ONLY__.isViewMode('module')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(__TEST_ONLY__.isViewMode('GRADE')).toBe(false);
    expect(__TEST_ONLY__.isViewMode('')).toBe(false);
    expect(__TEST_ONLY__.isViewMode(null)).toBe(false);
    expect(__TEST_ONLY__.isViewMode(undefined)).toBe(false);
    expect(__TEST_ONLY__.isViewMode(123)).toBe(false);
    expect(__TEST_ONLY__.isViewMode({})).toBe(false);
  });
});
