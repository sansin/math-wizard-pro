'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Wizard } from '@/components/Wizard';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getBrowserClient } from '@/lib/supabase/browser';
import type { GradeBand } from '@/types/core';

/**
 * Next.js 15+ requires `useSearchParams` to be wrapped in Suspense so the
 * static prerender can bail out cleanly. This wrapper does that without
 * changing the visible UX.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginPageInner />
    </React.Suspense>
  );
}

function LoginPageInner() {
  const params = useSearchParams();
  const isSignup = params?.get('signup') === '1';
  const [mode, setMode] = React.useState<'login' | 'signup'>(isSignup ? 'signup' : 'login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [age, setAge] = React.useState('');
  const [gradeBand, setGradeBand] = React.useState<GradeBand>('4-5');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const sb = getBrowserClient();
    try {
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name || 'Wizard',
              grade_band: gradeBand,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setError('Check your email to confirm your account, then sign in.');
          setMode('login');
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push('/practice');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Wizard size={88} animated className="mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-sm text-ink-600 mt-1">
            {mode === 'signup'
              ? 'A free account unlocks adaptive practice + progress tracking.'
              : 'Sign in to continue your quest.'}
          </p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={submit} className="space-y-3">
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                      Display name
                    </label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="What should we call you?"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                        Age
                      </label>
                      <Input
                        type="number"
                        min={3}
                        max={99}
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                        Grade
                      </label>
                      <select
                        value={gradeBand}
                        onChange={(e) => setGradeBand(e.target.value as GradeBand)}
                        className="h-12 w-full rounded-xl border border-ink-200 bg-white px-3 text-base"
                      >
                        <option value="K-1">K – 1</option>
                        <option value="2-3">2 – 3</option>
                        <option value="4-5">4 – 5</option>
                        <option value="6-7">6 – 7</option>
                        <option value="8-9">8 – 9</option>
                        <option value="10-12">10 – 12</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                  Email
                </label>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-xl bg-ember-50 border border-ember-200 p-3 text-sm text-ember-800">
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} size="lg" className="w-full">
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-ink-600">
              {mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button onClick={() => setMode('login')} className="font-semibold text-wizard-600 hover:text-wizard-700">
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Need an account?{' '}
                  <button onClick={() => setMode('signup')} className="font-semibold text-wizard-600 hover:text-wizard-700">
                    Sign up free
                  </button>
                </>
              )}
            </div>

            <div className="mt-3 text-center">
              <Link
                href="/migrate"
                className="text-xs text-ink-500 hover:text-ink-700"
              >
                Coming from Classic Math Wizard? Import your progress →
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
