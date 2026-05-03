'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal accessible tooltip:
 *   - Shows on pointer hover, keyboard focus, AND tap (for mobile / touch)
 *   - Dismisses on blur, pointer-leave, or Escape
 *   - Tap-to-toggle when there's no hover capability
 *
 * We deliberately avoid pulling in a UI library (Radix etc.) — this is
 * the only place we use a tooltip and the contract is small.
 *
 * Accessibility:
 *   - The trigger is a `<button>` (keyboard reachable, has aria-describedby)
 *   - The tooltip body has `role="tooltip"` and a stable id
 *   - Escape closes the tooltip
 */
export interface TooltipProps {
  /** Content shown inside the tooltip popover. Accepts JSX so callers can
   *  style their own bullet lists, links, etc. */
  content: React.ReactNode;
  /** The element that triggers the tooltip — usually an icon button. */
  children: React.ReactNode;
  /** Optional aria-label for the trigger when `children` is icon-only. */
  triggerLabel?: string;
  /** Position of the popover relative to the trigger. Default: 'top'. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({
  content,
  children,
  triggerLabel,
  side = 'top',
  className,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const sideClasses: Record<NonNullable<TooltipProps['side']>, string> = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={triggerLabel}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation(); // don't bubble to a parent row's onClick
          setOpen((v) => !v);
        }}
        className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wizard-400"
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'absolute z-30 w-64 max-w-[80vw] rounded-lg bg-ink-900 text-white text-xs px-3 py-2 shadow-lg',
            'pointer-events-none',
            sideClasses[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
