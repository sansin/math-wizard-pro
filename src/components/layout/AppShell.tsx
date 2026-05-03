'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Wizard } from '@/components/Wizard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { getBrowserClient } from '@/lib/supabase/browser';

const NAV = [
  { href: '/practice',  label: 'Play',     icon: '🎮' },
  { href: '/dashboard', label: 'Progress', icon: '📊' },
  { href: '/parent',    label: 'Parent',   icon: '👨‍👩‍👧' },
  { href: '/settings',  label: 'Settings', icon: '⚙️' },
];

export interface AppShellProps {
  children: React.ReactNode;
  user: { name: string; level: number; xp: number; nextLevelXP: number; dailyGoal: number; dailyAnswered: number } | null;
  v1Url?: string;
}

export function AppShell({ children, user, v1Url }: AppShellProps) {
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Click-outside handling for the user dropdown.
  React.useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [userMenuOpen]);

  async function handleSignOut() {
    setUserMenuOpen(false);
    const sb = getBrowserClient();
    await sb.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          {/* Logo — for authed users this links to /practice (the home of
              the app), not the marketing landing. The page.tsx redirect
              handles the case if they go to / directly. */}
          <Link
            href={user ? '/practice' : '/'}
            className="flex items-center gap-2 group"
          >
            <Wizard size={36} animated={false} />
            <span className="font-display font-bold text-lg text-ink-900 group-hover:text-wizard-600 transition-colors">
              Math Wizard <span className="text-wizard-500">Pro</span>
            </span>
          </Link>

          <nav className="hidden md:flex ml-6 gap-1" aria-label="Primary">
            {NAV.map((n) => {
              const active = path?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    'px-3 h-10 inline-flex items-center gap-2 rounded-xl text-sm font-semibold transition-colors',
                    active
                      ? 'bg-wizard-100 text-wizard-700'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                  )}
                >
                  <span aria-hidden>{n.icon}</span>
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <div className="hidden sm:flex items-center gap-2 mr-2">
                <div className="text-right text-xs">
                  <div className="font-bold text-ink-900 leading-none">Lv. {user.level}</div>
                  <div className="text-ink-500">{user.xp} XP</div>
                </div>
                <div className="w-24 h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-wizard-400 to-spell-400 origin-left animate-progress-fill"
                    style={{
                      width: `${Math.min(100, Math.round(((user.xp - 0) / Math.max(1, user.nextLevelXP)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {v1Url ? (
              <a href={v1Url} className="hidden md:inline-block">
                <Button variant="ghost" size="sm">
                  ← Classic
                </Button>
              </a>
            ) : null}

            {/* User dropdown — visible on all viewport sizes when authed,
                holding name/email + Settings link + Sign out. */}
            {user && (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-wizard-100 text-wizard-700 font-display font-bold text-sm hover:bg-wizard-200 transition-colors"
                  aria-label="Account menu"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  title={user.name}
                >
                  {user.name?.charAt(0).toUpperCase() || '?'}
                </button>
                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-ink-100 bg-white shadow-card-hover py-1 animate-slide-down z-50"
                  >
                    <div className="px-3 py-2 border-b border-ink-100">
                      <div className="text-sm font-bold text-ink-900 truncate">{user.name}</div>
                      <div className="text-xs text-ink-500">Lv. {user.level} · {user.xp} XP</div>
                    </div>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-ink-800 hover:bg-ink-50 font-medium"
                      role="menuitem"
                    >
                      ⚙️ Settings
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-ink-800 hover:bg-ink-50 font-medium"
                      role="menuitem"
                    >
                      📊 Progress
                    </Link>
                    {v1Url && (
                      <a
                        href={v1Url}
                        className="block px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 font-medium md:hidden"
                        role="menuitem"
                      >
                        ← Classic Math Wizard
                      </a>
                    )}
                    <div className="border-t border-ink-100 my-1" />
                    <button
                      type="button"
                      onClick={handleSignOut}
                      role="menuitem"
                      className="block w-full text-left px-3 py-2 text-sm font-semibold text-ember-700 hover:bg-ember-50"
                    >
                      🚪 Sign out
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-ink-100"
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

        {/* Mobile nav drawer */}
        {menuOpen && (
          <div className="md:hidden border-t border-ink-100 bg-white animate-slide-down">
            <nav className="max-w-7xl mx-auto px-4 py-2 space-y-1" aria-label="Mobile">
              {NAV.map((n) => {
                const active = path?.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold',
                      active ? 'bg-wizard-100 text-wizard-700' : 'text-ink-700 hover:bg-ink-100',
                    )}
                  >
                    <span aria-hidden>{n.icon}</span>
                    {n.label}
                  </Link>
                );
              })}
              {v1Url && (
                <a
                  href={v1Url}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-ink-500 hover:bg-ink-100"
                >
                  ← Classic Math Wizard
                </a>
              )}
              {user && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleSignOut(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-ember-700 hover:bg-ember-50"
                >
                  🚪 Sign out
                </button>
              )}
            </nav>
          </div>
        )}
      </header>

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
