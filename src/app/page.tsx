/**
 * Landing page (unauthenticated). Hero + features + CTA.
 *
 * Compared to v1, the visual language is calmer — fewer gradients, more
 * white space, real wizard mascot, and intentional micro-interactions.
 */

import Link from 'next/link';
import { Wizard } from '@/components/Wizard';
import { Button } from '@/components/ui/Button';

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

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
        <Link href="/" className="flex items-center gap-2">
          <Wizard size={32} animated={false} />
          <span className="font-display font-bold text-lg">Math Wizard <span className="text-wizard-500">Pro</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/login?signup=1">
            <Button variant="primary" size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-20 text-center">
          <div className="flex justify-center mb-6">
            <Wizard size={140} mood="happy" />
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-ink-900">
            Practice math like it&apos;s a quest.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-ink-600 max-w-2xl mx-auto">
            AI-powered adaptive practice for K-12. Smart hints that don&apos;t spoil the answer.
            Step-by-step solutions when you need them. Built for kids, useful for parents.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/login?signup=1">
              <Button size="xl">🚀 Start free</Button>
            </Link>
            <Link href="/migrate">
              <Button size="xl" variant="secondary">Import from Classic →</Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-wizard-600 hover:text-wizard-700">Sign in</Link>
          </p>
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

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-wizard-500 to-wizard-700 text-white p-8 sm:p-12 text-center shadow-wizard-lg">
          <h3 className="font-display text-2xl sm:text-3xl font-bold mb-2">Ready to begin?</h3>
          <p className="text-wizard-100 mb-6">No credit card. No ads. Just practice.</p>
          <Link href="/login?signup=1">
            <Button variant="secondary" size="xl">🚀 Get started free</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-100 py-6 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} Math Wizard Pro · Made with curiosity.
      </footer>
    </div>
  );
}
