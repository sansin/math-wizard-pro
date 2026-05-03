'use client';

import { cn } from '@/lib/utils';
import type { ViewMode } from '@/hooks/useViewModePref';

/**
 * Segmented control switching the practice picker between
 * "by grade" and "by module" layouts. Persistence is owned by the
 * parent (via useViewModePref) — this component is presentation-only.
 *
 * Adventure Quest palette: wizard-tinted active state, ink for inactive.
 */
export interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  className?: string;
}

export function ViewModeToggle({ value, onChange, className }: ViewModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Practice picker layout"
      className={cn(
        'inline-flex bg-ink-100 rounded-xl p-1 select-none',
        className,
      )}
    >
      <Segment
        active={value === 'grade'}
        onClick={() => onChange('grade')}
        label="By grade"
      />
      <Segment
        active={value === 'module'}
        onClick={() => onChange('module')}
        label="By module"
      />
    </div>
  );
}

interface SegmentProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function Segment({ active, onClick, label }: SegmentProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm font-semibold rounded-lg transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wizard-400',
        active
          ? 'bg-white text-wizard-700 shadow-sm'
          : 'text-ink-600 hover:text-ink-800',
      )}
    >
      {label}
    </button>
  );
}
