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

const QUALITY_DOT: Record<string, string> = {
  frontier: 'bg-leaf-500',
  high: 'bg-leaf-400',
  good: 'bg-spell-400',
};

export function ProviderSettings() {
  const [keys, setKeys] = React.useState<KeyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tutorialFor, setTutorialFor] = React.useState<AIProviderId | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/keys');
      const d = await r.json();
      setKeys(d.keys ?? []);
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
            language models. You can add your own free API keys for unlimited use, or use the
            shared keys (limited daily quota). Adding even one key — Gemini is free and the easiest —
            unlocks the full experience.
          </p>

          <div className="space-y-2">
            {PROVIDER_LIST.map((p) => {
              const info = PROVIDER_INFO[p];
              const existing = keys.find((k) => k.provider === p);
              return (
                <ProviderRow
                  key={p}
                  providerId={p}
                  info={info}
                  existing={existing}
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

  // --- inner: single provider row ---
}

interface ProviderRowProps {
  providerId: AIProviderId;
  info: typeof PROVIDER_INFO[AIProviderId];
  existing?: KeyRow;
  onSaved: () => void;
  onTutorial: () => void;
  loading: boolean;
}

function ProviderRow({ providerId, info, existing, onSaved, onTutorial, loading }: ProviderRowProps) {
  const [editing, setEditing] = React.useState(false);
  const [keyVal, setKeyVal] = React.useState('');
  const [saving, setSaving] = React.useState(false);
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

      {editing && (
        <div className="mt-3 grid gap-2">
          <Input
            type="password"
            placeholder={`Paste your ${info.name} API key`}
            value={keyVal}
            onChange={(e) => setKeyVal(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {err && (
            <div className="rounded-lg bg-ember-50 border border-ember-200 p-2 text-xs text-ember-800">
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" loading={saving} disabled={keyVal.trim().length < 8} onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setKeyVal(''); setErr(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
