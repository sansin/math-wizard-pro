'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  // SSR-safe portal target — `document` doesn't exist during server
  // rendering, so we set this on mount.
  const [portalRoot, setPortalRoot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || !portalRoot) return null;

  // Modal contents are PORTALED to document.body. This is critical:
  // any ancestor of the original render location with `transform`,
  // `filter`, `backdrop-filter`, `perspective`, `will-change`, or
  // `contain: paint` creates a containing block that traps `position:
  // fixed` elements inside its bounds — the modal then can't escape
  // its parent's stacking context, and other on-page UI (like the
  // practice action bar) can render on top of it. Portaling to
  // <body> sidesteps every such trap.
  //
  // We also keep z-[100] and the body-overflow lock from the previous
  // version. With portaling AND high z-index, the modal is reliably
  // on top regardless of where the calling component lives in the tree.
  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6"
    >
      <button
        type="button"
        aria-label="Close dialog"
        // /70 opacity properly obscures the page underneath — /40 was
        // too faint and the action bar bled through.
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          // max-h + flex column lets the body scroll when the content
          // exceeds viewport height (e.g., long Report dialog with many
          // reasons + textarea). Without this, the title+actions would
          // be pushed off-screen on short viewports.
          'relative w-full bg-white rounded-3xl shadow-wizard-lg overflow-hidden animate-pop',
          'max-h-[90vh] flex flex-col',
          SIZE[size],
        )}
      >
        {title ? (
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 shrink-0">
            <h2 id="modal-title" className="text-lg font-display font-bold text-ink-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-400 hover:text-ink-700 rounded-full w-8 h-8 inline-flex items-center justify-center hover:bg-ink-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        ) : null}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );

  return createPortal(dialog, portalRoot);
}
