'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Wizard } from '@/components/Wizard';
import { cn } from '@/lib/utils';
import { getBrowserClient } from '@/lib/supabase/browser';
import { KeyReminder } from './KeyReminder';

const NAV = [
  { href: '/practice',  label: 'Play',     icon: '🎮' },
  { href: '/dashboard', label: 'Progress', icon: '📊' },
  { href: '/parent',    label: 'Parent',   icon: '👨‍👩‍👧' },
  { href: '/settings',  label: 'Settings', icon: '⚙️' },
];

export interface AppShellProps {
  children: React.ReactNode;
  user: {
    name: string;
    level: number;
    xp: number;
    nextLevelXP: number;
    dailyGoal: number;
    dailyAnswered: number;
  } | null;
  v1Url?: string;
}

/**
 * Header layout — mirrors the v1 (Classic) structure but in the Adventure
 * Quest palette: deep arcane→indigo gradient, gold XP bar, ember logout,
 * a gold "Back to Classic" pill.
 *
 * Layout (desktop):
 *   [logo]   [name • Grade · XP bar · daily count]   [Play|Progress|Settings|Parent] [Classic] [Logout]
 *
 * Mobile:    [logo]   [hamburger]
 *   drawer:  user info · nav · Classic · Logout
 */
export function AppShell({ children, user, v1Url }: AppShellProps) {
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    const sb = getBrowserClient();
    await sb.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const xpPct = user
    ? Math.min(100, Math.round((user.xp / Math.max(1, user.nextLevelXP)) * 100))
    : 0;

  return (
    <>
      <header
        className="sticky top-0 z-40 text-white shadow-lg"
        style={{
          background:
            'linear-gradient(95deg, #6D28D9 0%, #5B21B6 50%, #4338CA 100%)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-4">
            {/* ── Logo ────────────────────────────────────────────────── */}
            <Link
              href={user ? '/practice' : '/'}
              className="flex items-center gap-2 group shrink-0"
            >
              <Wizard size={36} animated={false} />
              <span className="font-display font-bold text-lg sm:text-xl text-white whitespace-nowrap">
                Math Wizard <span className="text-amber-300">Pro</span>
              </span>
            </Link>

            {/* ── Center: user info + XP bar + daily ──────────────────── */}
            {user && (
              <div className="hidden lg:flex flex-col items-center gap-0.5 mx-auto">
                <p className="font-semibold text-sm text-white/95 max-w-[260px] truncate">
                  {user.name}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-amber-300 whitespace-nowrap">
                    ⚡ Lv.{user.level}
                  </span>
                  <div className="w-32 h-2 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${xpPct}%`,
                        background:
                          'linear-gradient(90deg, #FBBF24 0%, #F59E0B 100%)',
                      }}
                    />
                  </div>
                  <span className="opacity-90 whitespace-nowrap">
                    {user.xp.toLocaleString()} XP
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs opacity-85">
                  <span>
                    📋 {Math.min(user.dailyAnswered, user.dailyGoal)}/{user.dailyGoal} today
                  </span>
                  {user.dailyAnswered >= user.dailyGoal && (
                    <span className="text-amber-300">✓</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Right: nav + classic + logout (desktop) ─────────────── */}
            <div className="ml-auto hidden md:flex items-center gap-2">
              {user && (
                <nav className="flex items-center gap-1" aria-label="Primary">
                  {NAV.map((n) => {
                    const active = path?.startsWith(n.href);
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        className={cn(
                          'px-3 lg:px-4 h-9 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold transition-all duration-150',
                          active
                            ? 'bg-white text-violet-700 shadow-md'
                            : 'text-white/90 hover:bg-white/15 hover:text-white',
                        )}
                      >
                        <span aria-hidden>{n.icon}</span>
                        <span className="hidden lg:inline">{n.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              )}

              {v1Url && (
                <a
                  href={v1Url}
                  className="inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-lg text-sm font-bold transition-all"
                  style={{ background: '#F59E0B', color: '#78350F' }}
                  title="Go back to the Classic Math Wizard"
                >
                  <span aria-hidden>←</span>
                  <span className="hidden lg:inline">Classic</span>
                </a>
              )}

              {user && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-lg text-sm font-bold text-white transition-colors hover:opacity-90"
                  style={{ background: '#DC2626' }}
                >
                  <span aria-hidden>🚪</span>
                  <span className="hidden lg:inline">Logout</span>
                </button>
              )}
            </div>

            {/* ── Mobile: hamburger ───────────────────────────────────── */}
            <button
              type="button"
              className="md:hidden ml-auto inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/15 text-white"
              onClick={() => setMenuOpen((m) => !m)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {menuOpen
                  ? <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
                  : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ──────────────────────────────────────────── */}
        {menuOpen && (
          <div className="md:hidden border-t border-white/15 animate-slide-down">
            <div className="max-w-7xl mx-auto px-4 py-3 space-y-1.5">
              {/* User info */}
              {user && (
                <div className="text-center py-2 border-b border-white/15 mb-1.5">
                  <p className="text-sm font-semibold text-white">{user.name}</p>
                  <div className="flex items-center justify-center gap-2 mt-1 text-xs">
                    <span className="font-bold text-amber-300">⚡ Lv.{user.level}</span>
                    <div className="w-24 h-2 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${xpPct}%`,
                          background: 'linear-gradient(90deg, #FBBF24, #F59E0B)',
                        }}
                      />
                    </div>
                    <span className="text-white/90">{user.xp.toLocaleString()} XP</span>
                  </div>
                  <p className="text-xs text-white/85 mt-1">
                    📋 {Math.min(user.dailyAnswered, user.dailyGoal)}/{user.dailyGoal} today
                    {user.dailyAnswered >= user.dailyGoal && ' ✓'}
                  </p>
                </div>
              )}

              {/* Nav */}
              {user && NAV.map((n) => {
                const active = path?.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                      active
                        ? 'bg-white text-violet-700'
                        : 'text-white/90 hover:bg-white/15',
                    )}
                  >
                    <span aria-hidden>{n.icon}</span>
                    {n.label}
                  </Link>
                );
              })}

              {/* Classic + Logout */}
              {v1Url && (
                <a
                  href={v1Url}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold"
                  style={{ background: '#F59E0B', color: '#78350F' }}
                >
                  <span aria-hidden>←</span>
                  Back to Classic
                </a>
              )}
              {user && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleSignOut(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold text-white"
                  style={{ background: '#DC2626' }}
                >
                  <span aria-hidden>🚪</span>
                  Logout
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Nudge new users (with <2 keys) to add provider keys. Self-mounts:
          shows modal first time, banner thereafter, nothing once 2+ keys
          are saved. Only render for authed users. */}
      {user && <KeyReminder />}

      <main id="main" className="min-h-[calc(100vh-4rem)]">
        {children}
      </main>

      <footer className="border-t border-ink-100 bg-white/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 text-xs text-ink-500 flex flex-col sm:flex-row items-center gap-2 justify-between">
          <span>© {new Date().getFullYear()} Math Wizard Pro</span>
          <span className="text-ink-400">Made with curiosity for curious minds.</span>
        </div>
      </footer>
    </>
  );
}
