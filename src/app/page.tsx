/**
 * Landing page (unauthenticated). Hero + features + CTA.
 *
 * If the visitor is already signed in, we send them straight to /practice
 * — clicking the logo from inside the app shouldn't drop them on the
 * marketing page.
 *
 * Compared to v1, the visual language is calmer — fewer gradients, more
 * white space, real wizard mascot, and intentional micro-interactions.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Wizard } from '@/components/Wizard';
import { Button } from '@/components/ui/Button';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: '🎯',
    title: 'Truly adaptive',
    body: 'Difficulty rises as you grow and softens when you stumble — every session is tuned to where you are right now.',
  },
  {
    icon: '🤖',
    title: 'AI-powered, every time',
    body: 'Six AI providers behind one router. Bring your own free API key, or use ours. Questions are always fresh — never canned.',
  },
  {
    icon: '💡',
    title: 'Smart progressive hints',
    body: 'Stuck? You get a concept nudge, then a strategy, then an almost-there hint. We never just give you the answer.',
  },
  {
    icon: '📖',
    title: 'Step-by-step solutions',
    body: 'When you miss a question, the wizard walks through the reasoning so you actually learn.',
  },
  {
    icon: '⚡',
    title: 'XP, streaks, levels',
    body: 'Climb 30 levels. Build streaks. Daily goals keep the practice habit alive — without making it feel like work.',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'Parent dashboard',
    body: 'Weekly digest with strengths, weak spots, and a short narrative summary of how your child is doing.',
  },
];

const STEPS = [
  { n: 1, title: 'Sign up free', body: 'Create an account or import progress from Classic Math Wizard.' },
  { n: 2, title: 'Pick your skills', body: 'Choose a grade and the topics you want to work on.' },
  { n: 3, title: 'Practice & level up', body: 'Answer adaptive questions, earn XP, see step-by-step solutions.' },
];

export default async function Landing() {
  // If already signed in, go straight to practice — the marketing landing
  // is for visitors who haven't created an account yet.
  const sb = await getServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (auth?.user) redirect('/practice');

  return (
    <div className="min-h-screen">
      {/* Hero — Adventure Quest deep-night palette */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background:
            'radial-gradient(ellipse at 30% 0%, #1F2872 0%, #0A0E2C 55%, #06081B 100%)',
        }}
      >
        {/* Decorative star field */}
        <div className="absolute inset-0 pointer-events-none opacity-60" aria-hidden>
          <div className="absolute top-10 left-[15%] h-1 w-1 rounded-full bg-white/80 animate-sparkle" />
          <div className="absolute top-24 left-[80%] h-1.5 w-1.5 rounded-full bg-white/70 animate-sparkle [animation-delay:0.6s]" />
          <div className="absolute top-40 left-[25%] h-1 w-1 rounded-full bg-amber-200/80 animate-sparkle [animation-delay:0.3s]" />
          <div className="absolute top-12 left-[55%] h-1 w-1 rounded-full bg-white/60 animate-sparkle [animation-delay:0.9s]" />
          <div className="absolute top-60 left-[70%] h-1 w-1 rounded-full bg-amber-100/70 animate-sparkle [animation-delay:1.2s]" />
          <div className="absolute top-72 left-[18%] h-1.5 w-1.5 rounded-full bg-white/50 animate-sparkle [animation-delay:1.6s]" />
          <div className="absolute top-32 left-[42%] h-1 w-1 rounded-full bg-violet-200/70 animate-sparkle [animation-delay:0.4s]" />
          <div className="absolute top-52 left-[88%] h-1 w-1 rounded-full bg-white/60 animate-sparkle [animation-delay:0.8s]" />
        </div>

        {/* Top bar */}
        <header className="relative max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <Link href="/" className="flex items-center gap-2">
            <Wizard size={32} animated={false} />
            <span className="font-display font-bold text-lg text-white">
              Math Wizard <span className="text-amber-300">Pro</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden sm:block">
              <button className="text-sm font-semibold text-white/80 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">
                Sign in
              </button>
            </Link>
            <Link href="/login?signup=1">
              <button
                className="text-sm font-bold px-4 py-2 rounded-lg shadow-lg transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #FAB200, #D69200)', color: '#2F2000' }}
              >
                Get started
              </button>
            </Link>
          </div>
        </header>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-24 text-center">
          <div className="flex justify-center mb-6">
            <Wizard size={140} mood="happy" />
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight">
            Practice math like it&apos;s a{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #FFCB42, #FAB200)' }}
            >
              quest.
            </span>
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-white/80 max-w-2xl mx-auto">
            AI-powered adaptive practice for K-12. Smart hints that don&apos;t spoil the answer.
            Step-by-step solutions when you need them. Built for kids, useful for parents.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/login?signup=1">
              <Button size="xl">🚀 Start free</Button>
            </Link>
            <Link href="/migrate">
              <Button
                size="xl"
                variant="secondary"
                className="!bg-white/10 !text-white !border-white/30 hover:!bg-white/20"
              >
                Import from Classic →
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-white/60">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-amber-300 hover:text-amber-200">
              Sign in
            </Link>
          </p>
        </div>
      </section>

      {/* Module identity strip — shows the jewel-tone palette in action */}
      <section className="border-y border-ink-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-center text-sm font-semibold text-ink-500 mb-4 tracking-wider uppercase">
            Every module has its own color identity
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {[
              { icon: '➕', name: 'Addition',       bg: '#1746C2' },
              { icon: '➖', name: 'Subtraction',    bg: '#D11B3F' },
              { icon: '✖️', name: 'Multiplication', bg: '#0E8B55' },
              { icon: '➗', name: 'Division',       bg: '#5F18D8' },
              { icon: '🥧', name: 'Fractions',      bg: '#BD7A00' },
              { icon: '💯', name: 'Decimals',       bg: '#0C8482' },
              { icon: '🔤', name: 'Algebra',        bg: '#570FBE' },
              { icon: '📐', name: 'Geometry',       bg: '#D8430E' },
              { icon: '📊', name: 'Statistics',     bg: '#D31D52' },
            ].map((m) => (
              <div
                key={m.name}
                className="flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 text-xs font-semibold text-white shadow-sm"
                style={{ background: m.bg }}
              >
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20"
                  aria-hidden
                >
                  {m.icon}
                </span>
                <span>{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white/40 border-y border-ink-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center text-ink-900 mb-2">
            Built for the way kids actually learn
          </h2>
          <p className="text-center text-ink-600 mb-10 max-w-2xl mx-auto">
            Every feature is tuned to keep students in the flow zone — not too easy, not too hard, never frustrating.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <article key={f.title} className="rounded-2xl border border-ink-100 bg-white p-6 hover:shadow-card-hover hover:-translate-y-0.5 transition-all">
                <div className="text-3xl mb-3" aria-hidden>{f.icon}</div>
                <h3 className="font-display font-bold text-ink-900 mb-1">{f.title}</h3>
                <p className="text-sm text-ink-600 leading-relaxed">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center text-ink-900 mb-10">
          Three steps to start
        </h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <li key={s.n} className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-wizard-100 text-wizard-700 font-display font-bold text-xl inline-flex items-center justify-center mb-3">
                {s.n}
              </div>
              <h3 className="font-display font-bold text-ink-900 mb-1">{s.title}</h3>
              <p className="text-sm text-ink-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA — deep-night with gold accent */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div
          className="relative overflow-hidden rounded-3xl text-white p-8 sm:p-12 text-center shadow-wizard-lg"
          style={{
            background:
              'radial-gradient(ellipse at top right, #5F18D8 0%, #1F2872 45%, #0A0E2C 100%)',
          }}
        >
          <div className="absolute inset-0 pointer-events-none opacity-50" aria-hidden>
            <div className="absolute top-6 left-[20%] h-1 w-1 rounded-full bg-amber-200 animate-sparkle" />
            <div className="absolute top-12 left-[70%] h-1.5 w-1.5 rounded-full bg-white animate-sparkle [animation-delay:0.5s]" />
            <div className="absolute bottom-6 left-[50%] h-1 w-1 rounded-full bg-amber-100 animate-sparkle [animation-delay:1s]" />
          </div>
          <h3 className="relative font-display text-2xl sm:text-3xl font-bold mb-2">
            Ready to begin your quest?
          </h3>
          <p className="relative text-white/80 mb-6">No credit card. No ads. Just practice.</p>
          <Link href="/login?signup=1" className="relative inline-block">
            <Button
              size="xl"
              className="!shadow-lg"
              style={{ background: 'linear-gradient(135deg, #FAB200, #D69200)', color: '#2F2000' }}
            >
              🚀 Get started free
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-100 py-6 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} Math Wizard Pro · Made with curiosity.
      </footer>
    </div>
  );
}
