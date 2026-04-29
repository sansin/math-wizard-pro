'use client';

/**
 * v1 → v2 migration page.
 *
 * Two flows:
 *   1) Sign in with Classic credentials (Firebase email/password) → we exchange
 *      those for a v1 ID token, hit our server endpoint to copy progress, then
 *      ask the user to set a v2 password (or use the same one) and create a
 *      Supabase account that's linked to the same email.
 *   2) Already have a v2 account? Just enter old credentials and we'll merge
 *      the historical progress into your existing Supabase account.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Wizard } from '@/components/Wizard';

interface MigrationPreview {
  legacyUid: string;
  email: string;
  displayName: string;
  gradeBand: string;
  totalXP: number;
  answerCount: number;
  level: number;
}

export default function MigratePage() {
  const router = useRouter();
  const [step, setStep] = React.useState<'enter' | 'confirm' | 'done'>('enter');
  const [legacyEmail, setLegacyEmail] = React.useState('');
  const [legacyPassword, setLegacyPassword] = React.useState('');
  const [v2Password, setV2Password] = React.useState('');
  const [preview, setPreview] = React.useState<MigrationPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function fetchPreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/migrate/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: legacyEmail, password: legacyPassword }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || 'Could not load Classic data');
      setPreview(d.preview);
      setStep('confirm');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/migrate/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: legacyEmail,
          legacyPassword,
          v2Password,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || 'Migration failed');
      setStep('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <Wizard mood="happy" size={120} className="mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-ink-900 mb-2">All set!</h1>
          <p className="text-ink-600 mb-6">
            Your progress from Classic Math Wizard has been imported. You can now sign in with the same email and your new password.
          </p>
          <Button onClick={() => router.push('/login')} size="lg">Go to sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Wizard size={88} animated className="mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold">Import from Classic Math Wizard</h1>
          <p className="text-sm text-ink-600 mt-1">
            We&apos;ll copy your XP, level, and answer history from your old account into Math Wizard Pro.
          </p>
        </div>

        <Card>
          <CardBody>
            {step === 'enter' && (
              <form onSubmit={fetchPreview} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                    Classic email
                  </label>
                  <Input type="email" value={legacyEmail} onChange={(e) => setLegacyEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                    Classic password
                  </label>
                  <Input type="password" value={legacyPassword} onChange={(e) => setLegacyPassword(e.target.value)} required />
                </div>
                {error && (
                  <div className="rounded-xl bg-ember-50 border border-ember-200 p-3 text-sm text-ember-800">
                    {error}
                  </div>
                )}
                <Button type="submit" loading={loading} size="lg" className="w-full">
                  Continue →
                </Button>
                <p className="text-xs text-ink-500 text-center">
                  We never store your Classic password. It&apos;s only used to verify the import.
                </p>
              </form>
            )}

            {step === 'confirm' && preview && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-wizard-50 border border-wizard-200 p-4">
                  <div className="text-sm text-ink-700">
                    Found this account on Classic:
                  </div>
                  <div className="mt-2 text-sm">
                    <div><strong>{preview.displayName}</strong> · Grade {preview.gradeBand}</div>
                    <div className="text-ink-500">
                      {preview.totalXP} XP · Level {preview.level} · {preview.answerCount} answers
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                    Set a password for Math Wizard Pro
                  </label>
                  <Input
                    type="password"
                    value={v2Password}
                    onChange={(e) => setV2Password(e.target.value)}
                    minLength={6}
                    required
                  />
                  <p className="text-xs text-ink-500 mt-1">
                    You&apos;ll use this with the same email to sign in to Math Wizard Pro.
                  </p>
                </div>
                {error && (
                  <div className="rounded-xl bg-ember-50 border border-ember-200 p-3 text-sm text-ember-800">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => setStep('enter')} variant="ghost">Back</Button>
                  <Button onClick={commit} disabled={v2Password.length < 6} loading={loading} className="flex-1">
                    Import my progress
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 text-center text-xs text-ink-500">
              Don&apos;t want to migrate?{' '}
              <Link href="/login" className="font-semibold text-wizard-600">Just create a fresh account →</Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
