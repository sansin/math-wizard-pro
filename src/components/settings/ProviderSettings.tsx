'use client';

import * as React from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PROVIDER_INFO, PROVIDER_LIST } from '@/lib/ai/provider-info';
import type { AIProviderId } from '@/types/core';
import { cn } from '@/lib/utils';

interface KeyRow {
  provider: AIProviderId;
  hint: string;
  active: boolean;
  added_at: string;
}

interface UsageRow {
  provider: AIProviderId;
  source: 'user' | 'admin' | 'validate';
  todayRequests: number;
  todayTokens: number;
  totalRequests: number;
  totalTokens: number;
  lastUsedAt: string | null;
}

interface ValidationRecord {
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  validatedAt: string;
}

const QUALITY_DOT: Record<string, string> = {
  frontier: 'bg-leaf-500',
  high: 'bg-leaf-400',
  good: 'bg-spell-400',
};

// ─── Helpers ────────────────────────────────────────────────────────────
// Defined as `const` arrow functions BEFORE any component that uses them,
// so they're guaranteed to be in scope under Turbopack's HMR (function
// declaration hoisting was getting lost during hot reload, causing
// "classifyValidationResult is not defined" errors).

const formatTokens = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
};

const timeAgo = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
};

interface Classification {
  tone: 'success' | 'warning' | 'error';
  icon: string;
  label: string;
  detail?: string;
}

/**
 * Classify a validation result. Some failures (insufficient balance,
 * rate-limit) mean the KEY is fine — it's an account-level issue. We
 * surface that as a "warning" rather than a hard "invalid key" error.
 */
const classifyValidationResult = (r: { ok: boolean; message?: string }): Classification => {
  if (r.ok) {
    return { tone: 'success', icon: '✓', label: 'Key works', detail: 'Validated successfully — your key is connected and ready.' };
  }

  const msg = (r.message ?? '').toLowerCase();

  if (
    msg.includes('insufficient balance') ||
    msg.includes('insufficient_funds') ||
    msg.includes('billing') ||
    msg.includes('payment required') ||
    msg.includes(' 402')
  ) {
    return {
      tone: 'warning',
      icon: '💳',
      label: 'Key is valid — account needs funding',
      detail: 'Your key authenticates fine, but the provider account has a $0 balance. Add credit on the provider site, or remove this key and use a free-tier provider instead.',
    };
  }

  if (msg.includes('rate-limit') || msg.includes('quota') || msg.includes(' 429')) {
    return {
      tone: 'warning',
      icon: '⏱️',
      label: 'Key is valid — quota reached',
      detail: 'Key authenticates fine, but you\'ve hit a rate limit (per-minute or daily cap). Try again in a minute, or top up / wait for daily reset.',
    };
  }

  if (msg.includes(' 401') || msg.includes(' 403') || msg.includes('auth') || msg.includes('unauthorized') || msg.includes('invalid api key')) {
    return {
      tone: 'error',
      icon: '✗',
      label: 'Invalid key',
      detail: r.message || 'The provider rejected the key. Double-check you copied it correctly, or generate a new one.',
    };
  }

  if (msg.includes('model') && (msg.includes('not found') || msg.includes('access') || msg.includes('does not exist') || msg.includes(' 404'))) {
    return {
      tone: 'warning',
      icon: '🔒',
      label: 'Key works, model not accessible',
      detail: 'Your key authenticates fine, but the default model isn\'t available on your tier. Try a different model via the provider\'s env var override.',
    };
  }

  return { tone: 'error', icon: '✗', label: 'Validation failed', detail: r.message };
};

export function ProviderSettings() {
  const [keys, setKeys] = React.useState<KeyRow[]>([]);
  const [usage, setUsage] = React.useState<UsageRow[]>([]);
  const [validations, setValidations] = React.useState<Partial<Record<AIProviderId, ValidationRecord>>>({});
  const [loading, setLoading] = React.useState(true);
  const [tutorialFor, setTutorialFor] = React.useState<AIProviderId | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/keys');
      const d = await r.json();
      setKeys(d.keys ?? []);
      setUsage(d.usage ?? []);
      setValidations(d.validations ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h2 className="font-display text-xl font-bold mb-1">AI Providers</h2>
          <p className="text-sm text-ink-600 mb-4">
            Math Wizard Pro is truly AI-powered: questions, hints, and solutions come from large
            language models. Add your own free API keys for unlimited use, or use the shared keys
            (limited daily quota). Adding even one key — Gemini is free and the easiest — unlocks
            the full experience.
          </p>

          <div className="space-y-2">
            {PROVIDER_LIST.map((p) => {
              const info = PROVIDER_INFO[p];
              const existing = keys.find((k) => k.provider === p);
              // Aggregate ALL sources for this provider — practice uses
              // 'user' or 'admin', the test-key flow uses 'validate'.
              // Showing the sum is the simplest mental model for users.
              const rows = usage.filter((u) => u.provider === p);
              const aggregated = rows.length === 0 ? undefined : {
                provider: p,
                source: 'user' as const,
                todayRequests: rows.reduce((a, u) => a + u.todayRequests, 0),
                todayTokens: rows.reduce((a, u) => a + u.todayTokens, 0),
                totalRequests: rows.reduce((a, u) => a + u.totalRequests, 0),
                totalTokens: rows.reduce((a, u) => a + u.totalTokens, 0),
                lastUsedAt: rows.reduce<string | null>((a, u) =>
                  !a || (u.lastUsedAt && u.lastUsedAt > a) ? u.lastUsedAt : a, null),
              };
              return (
                <ProviderRow
                  key={p}
                  providerId={p}
                  info={info}
                  existing={existing}
                  usage={aggregated}
                  validation={validations[p] ?? null}
                  onSaved={refresh}
                  onTutorial={() => setTutorialFor(p)}
                  loading={loading}
                />
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Modal
        open={tutorialFor !== null}
        onClose={() => setTutorialFor(null)}
        title={tutorialFor ? `Get a ${PROVIDER_INFO[tutorialFor].name} API key` : ''}
        size="md"
      >
        {tutorialFor && (
          <div className="px-6 pb-6 pt-2 space-y-4">
            <p className="text-sm text-ink-600">
              <strong>Free tier:</strong> {PROVIDER_INFO[tutorialFor].freeTier}
            </p>
            <ol className="space-y-3">
              {PROVIDER_INFO[tutorialFor].setupSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-wizard-500 text-white text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-ink-700">{step}</span>
                </li>
              ))}
            </ol>
            <a
              href={PROVIDER_INFO[tutorialFor].signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button className="w-full" variant="primary">
                Open {PROVIDER_INFO[tutorialFor].name} →
              </Button>
            </a>
            <p className="text-xs text-ink-500 text-center">
              Your key is encrypted before being stored. We never share or log it.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

interface ProviderRowProps {
  providerId: AIProviderId;
  info: typeof PROVIDER_INFO[AIProviderId];
  existing?: KeyRow;
  usage?: UsageRow;
  validation: ValidationRecord | null;
  onSaved: () => void;
  onTutorial: () => void;
  loading: boolean;
}

function ProviderRow({
  providerId,
  info,
  existing,
  usage,
  validation,
  onSaved,
  onTutorial,
  loading,
}: ProviderRowProps) {
  const [editing, setEditing] = React.useState(false);
  const [keyVal, setKeyVal] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [validateResult, setValidateResult] = React.useState<{
    ok: boolean;
    model?: string;
    latencyMs?: number;
    message?: string;
  } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const r = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, key: keyVal.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || 'Save failed');
      setKeyVal('');
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function validate(keyToTest: string) {
    if (keyToTest.trim().length < 8) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const r = await fetch('/api/keys/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, key: keyToTest.trim() }),
      });
      const d = await r.json();
      setValidateResult({
        ok: !!d.ok,
        model: d.model,
        latencyMs: d.latencyMs,
        message: d.message,
      });
    } catch (e) {
      setValidateResult({ ok: false, message: (e as Error).message });
    } finally {
      setValidating(false);
    }
  }

  /** Validate the SAVED key — no key text passed; the server has it. */
  async function validateSaved() {
    setValidating(true);
    setValidateResult(null);
    try {
      // We don't expose the saved key to the client, so we hit a slightly
      // different flow: re-issue a generation request via the shared
      // validate endpoint with a flag — but our endpoint requires the key.
      // Workaround: ask the user to enter it again, OR just refresh
      // validations cache. For now we use the persisted validation
      // record and show "Last validated: XXX".
      onSaved(); // refreshes everything
    } finally {
      setValidating(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove your ${info.name} key?`)) return;
    setSaving(true);
    try {
      await fetch(`/api/keys?provider=${providerId}`, { method: 'DELETE' });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  // Live validation result (just-tested) takes precedence; fall back to
  // persisted validation from the DB.
  const showValidation = validateResult ?? (validation
    ? {
        ok: validation.ok,
        model: validation.model ?? undefined,
        latencyMs: validation.latencyMs ?? undefined,
        message: validation.errorMessage ?? undefined,
      }
    : null);

  return (
    <div className={cn(
      'rounded-2xl border p-4 transition-colors',
      existing ? 'border-leaf-300 bg-leaf-50/40' : 'border-ink-200 bg-white',
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-ink-900">{info.name}</span>
            <span className={cn('inline-flex items-center gap-1 text-2xs uppercase font-bold tracking-wider rounded-full px-2 py-0.5', QUALITY_DOT[info.qualityTier], 'text-white')}>
              {info.qualityTier}
            </span>
            <span className="text-2xs uppercase text-ink-500 tracking-wider">{info.latencyTier}</span>
            {existing ? (
              <span className="text-2xs font-bold text-leaf-700">✓ Connected</span>
            ) : null}
          </div>
          <p className="text-sm text-ink-600 mt-0.5">{info.tagline}</p>
          <p className="text-xs text-ink-500 mt-1">
            Free tier: {info.freeTier}
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {!editing && !existing && (
            <Button size="sm" variant="primary" onClick={() => setEditing(true)} disabled={loading}>
              Add key
            </Button>
          )}
          {!editing && existing && (
            <>
              <span className="font-mono text-xs text-ink-500">…{existing.hint}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  Replace
                </Button>
                <Button size="sm" variant="ghost" onClick={remove} disabled={saving}>
                  Remove
                </Button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onTutorial}
            className="text-xs text-wizard-600 hover:text-wizard-700 font-semibold"
          >
            How do I get a key? →
          </button>
        </div>
      </div>

      {/* Validation status + usage row — only shown when there's a saved key */}
      {!editing && existing && (showValidation || usage) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {showValidation && (() => {
            const c = classifyValidationResult({ ok: showValidation.ok, message: showValidation.message });
            const colorClass = c.tone === 'success' ? 'text-leaf-700'
              : c.tone === 'warning' ? 'text-spell-700'
              : 'text-ember-700';
            return (
              <span className={cn('inline-flex items-center gap-1', colorClass)}>
                <span aria-hidden>{c.icon}</span>
                <span className="font-semibold">{c.label}</span>
                {showValidation.ok && showValidation.model && (
                  <span className="text-ink-500">· {showValidation.model}</span>
                )}
                {typeof showValidation.latencyMs === 'number' && (
                  <span className="text-ink-400">· {showValidation.latencyMs}ms</span>
                )}
                {validation?.validatedAt && (
                  <span className="text-ink-400">
                    · {timeAgo(validation.validatedAt)}
                  </span>
                )}
              </span>
            );
          })()}
          {usage && (usage.todayRequests > 0 || usage.totalRequests > 0) && (
            <span className="inline-flex items-center gap-1 text-ink-600">
              <span aria-hidden>📊</span>
              <span>
                {usage.todayRequests > 0 ? (
                  <>
                    Today: <strong>{usage.todayRequests}</strong>{' '}
                    req{usage.todayRequests === 1 ? '' : 's'} · {formatTokens(usage.todayTokens)} tokens
                  </>
                ) : (
                  <>Idle today</>
                )}
              </span>
              {usage.totalRequests > usage.todayRequests && (
                <span className="text-ink-400">
                  · all-time: {usage.totalRequests} reqs / {formatTokens(usage.totalTokens)}
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 grid gap-2">
          <Input
            type="password"
            placeholder={`Paste your ${info.name} API key`}
            value={keyVal}
            onChange={(e) => { setKeyVal(e.target.value); setValidateResult(null); }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {/* Live validation result while editing */}
          {validateResult && (() => {
            const classification = classifyValidationResult(validateResult);
            return (
              <div
                className={cn(
                  'rounded-lg border p-2.5 text-xs',
                  classification.tone === 'success'
                    ? 'bg-leaf-50 border-leaf-200 text-leaf-900'
                    : classification.tone === 'warning'
                    ? 'bg-spell-50 border-spell-300 text-spell-900'
                    : 'bg-ember-50 border-ember-200 text-ember-900',
                )}
              >
                <div className="font-bold mb-0.5">
                  {classification.icon} {classification.label}
                </div>
                {classification.detail && (
                  <div className="text-2xs leading-relaxed">{classification.detail}</div>
                )}
                {validateResult.ok && validateResult.model && (
                  <div className="text-2xs mt-0.5 opacity-80">
                    Model: <span className="font-mono">{validateResult.model}</span>
                    {typeof validateResult.latencyMs === 'number' && <> · {validateResult.latencyMs}ms</>}
                  </div>
                )}
              </div>
            );
          })()}
          {err && (
            <div className="rounded-lg bg-ember-50 border border-ember-200 p-2 text-xs text-ember-800">
              {err}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" loading={saving} disabled={keyVal.trim().length < 8} onClick={save}>
              Save
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={validating}
              disabled={keyVal.trim().length < 8}
              onClick={() => validate(keyVal)}
              title="Test the key without saving"
            >
              {validating ? 'Testing…' : '✓ Test key'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setKeyVal('');
                setErr(null);
                setValidateResult(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-2xs text-ink-500">
            Tip: hit <strong>Test key</strong> first to make sure it works before saving.
          </p>
        </div>
      )}
    </div>
  );
}

