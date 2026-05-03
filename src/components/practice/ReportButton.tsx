'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

/**
 * Subtle "Report this question" link with a quick-reason modal.
 *
 * Submitting a report bumps flagged_count on the question; once a question
 * is flagged 3+ times, it gets demoted in the cache lookup so other users
 * stop seeing it.
 */

// Keep this list in sync with the `reason` enum in
// /api/questions/report/route.ts — both are user-facing controls.
const REASONS: Array<{ value: string; label: string }> = [
  { value: 'wrong-answer', label: '❌ The answer is wrong' },
  { value: 'confusing', label: '🤔 Question is unclear / confusing' },
  { value: 'too-hard', label: '😰 Too hard for this level' },
  { value: 'too-easy', label: '😴 Too easy for this level' },
  { value: 'duplicate', label: '🔁 Duplicate / repeat question' },
  { value: 'other', label: '✏️ Something else' },
];

export interface ReportButtonProps {
  questionId: string;
}

export function ReportButton({ questionId }: ReportButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [reason, setReason] = React.useState<string>('');
  const [comment, setComment] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Reset state when the question changes (caller can pass a new id).
  React.useEffect(() => {
    setSubmitted(false);
    setReason('');
    setComment('');
    setErr(null);
  }, [questionId]);

  async function submit() {
    if (!reason) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/questions/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId,
          reason,
          comment: comment.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || j.error || 'Could not submit');
      }
      setSubmitted(true);
      // Auto-close after a moment.
      setTimeout(() => setOpen(false), 1500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-400 hover:text-ember-600 underline-offset-4 hover:underline transition-colors"
        title="Report this question"
      >
        🚩 Report this question
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Report this question" size="sm">
        <div className="px-6 pb-6 pt-2 space-y-4">
          {submitted ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">🙏</div>
              <p className="text-sm font-semibold text-ink-900">Thanks — we&apos;ll review it.</p>
              <p className="text-xs text-ink-500 mt-1">
                Reports help us retire bad questions from the pool.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-600">
                What&apos;s wrong with this question?
              </p>

              <div className="space-y-1.5">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={
                      'flex items-center gap-2.5 p-2.5 rounded-lg border-2 cursor-pointer transition-all ' +
                      (reason === r.value
                        ? 'border-wizard-400 bg-wizard-50'
                        : 'border-ink-100 hover:border-wizard-200 hover:bg-wizard-50/40')
                    }
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="sr-only"
                    />
                    <span
                      className={
                        'inline-block h-4 w-4 rounded-full border-2 shrink-0 ' +
                        (reason === r.value
                          ? 'border-wizard-500 bg-wizard-500 ring-2 ring-wizard-200'
                          : 'border-ink-300')
                      }
                      aria-hidden
                    />
                    <span className="text-sm text-ink-800">{r.label}</span>
                  </label>
                ))}
              </div>

              {reason === 'other' && (
                <textarea
                  placeholder="Tell us more (optional)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-lg border-2 border-ink-200 p-2 text-sm focus:border-wizard-400 focus:outline-none focus:ring-4 focus:ring-wizard-100"
                />
              )}

              {err && (
                <div className="rounded-lg bg-ember-50 border border-ember-200 p-2 text-xs text-ember-800">
                  {err}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={loading}
                  disabled={!reason}
                  onClick={submit}
                >
                  Submit report
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
