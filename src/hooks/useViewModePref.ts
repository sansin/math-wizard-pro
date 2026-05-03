'use client';

import * as React from 'react';

/**
 * The two ways the practice picker can be organized:
 *   - 'grade'  → choose a grade band, see modules within it (default, current behavior)
 *   - 'module' → choose a module, see skills across grade bands (new — for
 *                self-directed deep learners who want to drill one topic)
 */
export type ViewMode = 'grade' | 'module';

const STORAGE_KEY = 'mwp-practice-view-mode';
const DEFAULT_MODE: ViewMode = 'grade';

/** Type guard for the persisted value. Anything other than the two known
 *  values falls back to default — protects against future schema changes
 *  or hand-edits to localStorage. */
function isViewMode(v: unknown): v is ViewMode {
  return v === 'grade' || v === 'module';
}

/**
 * Persistent preference for how the practice picker is organized. Stored
 * in `localStorage` so it survives page reloads but stays per-browser
 * (no DB roundtrip required). If we ever want cross-device sync we can
 * upgrade to a `profiles.view_preference` column without changing the hook.
 *
 * SSR-safe: `localStorage` access is guarded so it doesn't blow up during
 * server rendering or hydration. We read once on mount and emit the
 * default value before that.
 *
 * Returns a `[value, setValue]` tuple just like `useState`. Setting the
 * value writes to localStorage immediately.
 */
export function useViewModePref(): [ViewMode, (next: ViewMode) => void] {
  const [mode, setModeState] = React.useState<ViewMode>(DEFAULT_MODE);

  // Read the stored value once on mount. We avoid initializing useState
  // with a localStorage read because doing so during SSR throws.
  React.useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && isViewMode(raw)) setModeState(raw);
    } catch {
      // Private-browsing mode, or storage quota exceeded, or some other
      // weirdness. Default to the in-memory state and keep going.
    }
  }, []);

  const setMode = React.useCallback((next: ViewMode) => {
    setModeState(next);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // ignore — the in-memory state still updates
    }
  }, []);

  return [mode, setMode];
}

// Exported for tests; internal otherwise.
export const __TEST_ONLY__ = { STORAGE_KEY, DEFAULT_MODE, isViewMode };
