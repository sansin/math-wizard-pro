'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wizard } from '@/components/Wizard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

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
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
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
