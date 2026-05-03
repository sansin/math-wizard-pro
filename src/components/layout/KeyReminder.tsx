'use client';

import * as React from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Wizard } from '@/components/Wizard';

/**
 * KeyReminder — shows a modal to brand-new users encouraging them to add
 * 2+ AI provider keys for the best experience. If the user dismisses it,
 * a slim banner stays at the top of every page until 2 keys are saved.
 *
 * Lifecycle:
 *   - Fetches /api/keys on mount; counts saved providers.
 *   - 0-1 keys → show modal (unless previously dismissed).
 *   - Modal dismissed → show banner instead, on every page.
 *   - 2+ keys → render nothing.
 *
 * Persistence: dismissal is stored in localStorage so the modal doesn't
 * re-pop on every navigation.
 */

const DISMISS_STORAGE_KEY = 'mwp-keyreminder-dismissed-v1';

export function KeyReminder() {
  const [keyCount, setKeyCount] = React.useState<number | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  // Read dismissed state from localStorage on mount.
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_STORAGE_KEY)) {
        setDismissed(true);
      }
    } catch {
      /* ignore — private browsing etc */
    }
  }, []);

  // Fetch current key count.
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/keys')
      .then((r) => (r.ok ? r.json() : { keys: [] }))
      .then((data) => {
        if (cancelled) return;
        setKeyCount(Array.isArray(data?.keys) ? data.keys.length : 0);
      })
      .catch(() => {
        if (!cancelled) setKeyCount(0);
      });
    return () => { cancelled = true; };
  }, []);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DISMISS_STORAGE_KEY, '1');
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Threshold: 2+ keys → no nudge.
  if (keyCount === null) return null; // still loading
  if (keyCount >= 2) return null;

  // Modal first time, banner if dismissed.
  if (!dismissed) {
    return <KeyReminderModal keyCount={keyCount} onDismiss={dismiss} />;
  }
  return <KeyReminderBanner keyCount={keyCount} onDismiss={() => { /* persistent until they add keys */ }} />;
}

// ─── Modal ─────────────────────────────────────────────────────────────

function KeyReminderModal({ keyCount, onDismiss }: { keyCount: number; onDismiss: () => void }) {
  const [open, setOpen] = React.useState(true);
  const close = () => {
    setOpen(false);
    onDismiss();
  };
  return (
    <Modal open={open} onClose={close} title="Make Math Wizard Pro yours" size="md">
      <div className="px-6 pb-6 pt-2 space-y-4">
        <div className="flex items-center gap-4">
          <Wizard mood="thinking" size={64} />
          <div className="flex-1">
            <p className="text-sm text-ink-700 leading-relaxed">
              {keyCount === 0
                ? 'Math Wizard Pro is fully AI-powered — add at least one free API key to unlock unlimited adaptive practice.'
                : 'You have one key — adding a second gives you a fallback if the first hits its rate limit.'}
            </p>
            <p className="text-xs text-ink-500 mt-2">
              Adding 2+ keys means the router has fallbacks. When one provider rate-limits, another picks up. <strong>Recommended free providers:</strong> Gemini, Cloudflare Workers AI, Groq, Cerebras — none require a credit card.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-wizard-50 border border-wizard-200 p-3 text-xs text-wizard-900">
          <strong>Why this matters:</strong> with no keys you can't generate questions. With one, you may hit rate limits. With 2-3, the experience is smooth.
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" onClick={close}>
            Maybe later
          </Button>
          <Link href="/settings" onClick={close}>
            <Button variant="primary">
              Add API keys →
            </Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}

// ─── Banner ────────────────────────────────────────────────────────────

function KeyReminderBanner({ keyCount }: { keyCount: number; onDismiss: () => void }) {
  return (
    <div
      className="text-white px-4 py-2 text-sm flex items-center justify-center gap-3 flex-wrap"
      style={{
        background: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
        color: '#78350F',
      }}
    >
      <span aria-hidden>🔑</span>
      <span className="font-semibold">
        {keyCount === 0
          ? 'Add an API key to start generating questions —'
          : `You have only 1 of 10 supported AI providers configured. Add more for fallback —`}
      </span>
      <Link href="/settings" className="underline font-bold hover:text-amber-950">
        Open Settings →
      </Link>
    </div>
  );
}
