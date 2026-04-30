'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Wizard, type WizardMood } from '@/components/Wizard';
import { MathRender } from '@/components/math/MathRender';
import { AnswerInput } from '@/components/math/AnswerInput';
import { HintLadder } from './HintLadder';
import { SolutionPanel } from './SolutionPanel';
import { ProviderBadge } from './ProviderBadge';
import { SessionEndSummary } from './SessionEndSummary';
import { cn } from '@/lib/utils';
import { calculateXP } from '@/lib/mastery/xp';
import { formatDuration } from '@/lib/utils';
import type { Question, GradeBand } from '@/types/core';

const DIFFICULTY_LABELS: Record<1 | 2 | 3 | 4 | 5, { name: string; color: string }> = {
  1: { name: 'Warm-up', color: 'bg-leaf-100 text-leaf-800 border-leaf-200' },
  2: { name: 'Easy', color: 'bg-spell-100 text-spell-800 border-spell-200' },
  3: { name: 'Medium', color: 'bg-wizard-100 text-wizard-800 border-wizard-200' },
  4: { name: 'Hard', color: 'bg-ember-100 text-ember-800 border-ember-200' },
  5: { name: 'Challenge', color: 'bg-ember-200 text-ember-900 border-ember-300' },
};

export interface PracticeScreenProps {
  /** Skills the user opted in to. */
  skillIds: string[];
  /** Display name for the wizard's greeting. */
  studentName: string;
  gradeBand: GradeBand;
  mode: 'practice' | 'test';
  /** Called when user clicks "End session". */
  onEnd: () => void;
}

/**
 * Attempt state machine:
 *   idle          → user is typing
 *   correct       → got it right (celebration shown, advance to next)
 *   wrong-retry   → got it wrong; answer hidden; can Try Again / See Solution / Skip
 *   wrong-revealed → user gave up; correct answer + solution shown; advance to next
 */
interface AttemptState {
  status: 'idle' | 'correct' | 'wrong-retry' | 'wrong-revealed';
  xpEarned: number;
  expectedDisplay: string;
  /** How many times user submitted on this question (resets per question). */
  attempts: number;
}

const TEST_LENGTH = 10;

export function PracticeScreen({ skillIds, studentName, gradeBand, mode, onEnd }: PracticeScreenProps) {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState<Question | null>(null);
  const [reason, setReason] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [answer, setAnswer] = React.useState('');
  const [attempt, setAttempt] = React.useState<AttemptState>({
    status: 'idle', xpEarned: 0, expectedDisplay: '', attempts: 0,
  });
  const [hintsUsed, setHintsUsed] = React.useState(0);
  /**
   * Outcome buckets — tracked per session.
   *  firstTry  = got it correct on attempt #1
   *  retried   = got it correct on attempt #2+
   *  saw       = saw solution (gave up)
   *  skipped   = clicked Skip (gave up without seeing answer)
   *  total     = firstTry + retried + saw + skipped
   *  xp        = total XP earned this session
   */
  const [stats, setStats] = React.useState({
    firstTry: 0,
    retried: 0,
    saw: 0,
    skipped: 0,
    total: 0,
    xp: 0,
  });
  const [streak, setStreak] = React.useState(0);
  const [bestStreak, setBestStreak] = React.useState(0);
  const [sessionStart] = React.useState<number>(Date.now());
  const [showEndSummary, setShowEndSummary] = React.useState(false);
  const [skillCounts, setSkillCounts] = React.useState<Record<string, number>>({});
  /** skill_id → human name. Loaded once on mount from /api/skills so the
   *  end-session highlights and the practice header can show "Two-digit
   *  subtraction" instead of the cryptic "g23.sub.2digit". */
  const [skillNamesById, setSkillNamesById] = React.useState<Record<string, string>>({});
  const [recentSkillIds, setRecentSkillIds] = React.useState<string[]>([]);
  const [recentHashes, setRecentHashes] = React.useState<string[]>([]);
  const [lastDifficulty, setLastDifficulty] = React.useState<1 | 2 | 3 | 4 | 5 | undefined>();
  const [lastWasCorrect, setLastWasCorrect] = React.useState<boolean | undefined>();
  const [questionStart, setQuestionStart] = React.useState(0);
  const [providerInfo, setProviderInfo] = React.useState<{
    provider: string | null;
    source: string | null;  // 'user' | 'admin' | 'cache' | null
  }>({ provider: null, source: null });
  // AbortController for in-flight /api/questions/next so we can cancel on
  // unmount (End session) and avoid spurious 500s in the server logs.
  const inFlightRef = React.useRef<AbortController | null>(null);

  const wizardMood: WizardMood = attempt.status === 'correct'
    ? 'happy'
    : (attempt.status === 'wrong-retry' || attempt.status === 'wrong-revealed')
    ? 'oops'
    : loading ? 'thinking' : 'idle';

  // ─── Load human skill names for the highlights/header (best-effort) ──
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/skills?gradeBand=${encodeURIComponent(gradeBand)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const s of data.skills ?? []) map[s.id] = s.name;
        setSkillNamesById(map);
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [gradeBand]);

  // ─── Start session on mount ──────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, gradeBand, skillIds }),
        });
        const data = await res.json();
        if (!cancelled && data.session?.id) {
          setSessionId(data.session.id);
          await loadNext(data.session.id);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      // Abort any in-flight question fetch when unmounting (End session).
      if (inFlightRef.current) {
        inFlightRef.current.abort();
        inFlightRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNext(sId: string | null = sessionId) {
    // Abort any previous in-flight fetch.
    if (inFlightRef.current) inFlightRef.current.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    const callId = Math.random().toString(36).slice(2, 6);
    const avoidSnapshot = recentHashes.slice(-30);
    console.log(
      `[loadNext:${callId}] firing | avoid=[${avoidSnapshot.map((h) => h.slice(0, 6)).join(',')}] ` +
      `lastDiff=${lastDifficulty} lastCorrect=${lastWasCorrect}`,
    );

    setLoading(true);
    setError(null);
    setAnswer('');
    setHintsUsed(0);
    setAttempt({ status: 'idle', xpEarned: 0, expectedDisplay: '', attempts: 0 });
    try {
      const res = await fetch('/api/questions/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillIds,
          lastDifficulty,
          lastWasCorrect,
          recentSkillIds: recentSkillIds.slice(-5),
          avoidPromptHashes: avoidSnapshot,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          attempts?: Array<{ provider: string; ok: boolean; error?: string }>;
        };
        throw new Error(friendlyError(j));
      }
      const data = await res.json();
      console.log(
        `[loadNext:${callId}] received | id=${data.question.id?.slice(0, 8)} ` +
        `hash=${(data.question.promptHash ?? '').slice(0, 6)} skill=${data.question.skillId} ` +
        `diff=${data.question.difficulty} source=${data.source}`,
      );
      setQuestion(data.question);
      setReason(data.reason ?? '');
      setProviderInfo({ provider: data.provider ?? null, source: data.providerSource ?? null });
      setQuestionStart(Date.now());
      setRecentSkillIds((s) => [...s.slice(-9), data.question.skillId]);
      setRecentHashes((h) => [...h.slice(-49), data.question.promptHash]);
    } catch (e) {
      // Aborted requests are expected during End Session; don't surface as error.
      if ((e as Error).name === 'AbortError') {
        console.log(`[loadNext:${callId}] aborted`);
        return;
      }
      console.error(`[loadNext:${callId}] error:`, (e as Error).message);
      setError((e as Error).message);
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
      setLoading(false);
    }
  }

  async function submit() {
    if (!question || attempt.status !== 'idle' || !answer.trim()) return;

    const elapsedMs = Date.now() - questionStart;
    const optimisticXP = calculateXP({
      correct: true,
      difficulty: question.difficulty,
      streak,
      hintsUsed,
    });

    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          sessionId,
          submitted: answer,
          hintsUsed,
          timeMs: elapsedMs,
        }),
      });
      const data = await res.json();
      const correct = !!data.correct;
      const expected = data.expected;
      const expectedDisplay = formatExpected(expected);

      setAttempt((prev) => ({
        status: correct ? 'correct' : 'wrong-retry',
        xpEarned: data.xpEarned ?? optimisticXP,
        expectedDisplay,
        attempts: prev.attempts + 1,
      }));

      if (correct) {
        // Did the user get it on the FIRST submit, or did they retry?
        // attempt.attempts is the count BEFORE this submit; if 0, this is
        // the first attempt.
        const wasFirstTry = (attempt.attempts ?? 0) === 0;
        setStats((s) => ({
          ...s,
          firstTry: s.firstTry + (wasFirstTry ? 1 : 0),
          retried: s.retried + (wasFirstTry ? 0 : 1),
          total: s.total + 1,
          xp: s.xp + (data.xpEarned ?? 0),
        }));
        setStreak((cs) => {
          const next = cs + 1;
          setBestStreak((bs) => Math.max(bs, next));
          return next;
        });
        setSkillCounts((m) => ({ ...m, [question.skillId]: (m[question.skillId] ?? 0) + 1 }));
        setLastDifficulty(question.difficulty);
        setLastWasCorrect(true);
      }
      // For wrong answers: do NOT bump total here — that's counted when
      // the user resolves the question via See Solution or Skip.
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** User clicks "Try again" — reset to idle, keep the question. */
  function tryAgain() {
    setAnswer('');
    setAttempt((prev) => ({ ...prev, status: 'idle' }));
  }

  /** User clicks "See solution" — reveal answer + solution; counts as "saw". */
  function reveal() {
    if (!question) return;
    setAttempt((prev) => ({
      ...prev,
      status: 'wrong-revealed',
      expectedDisplay: prev.expectedDisplay || formatExpected(question.answer),
    }));
    setStats((s) => ({ ...s, saw: s.saw + 1, total: s.total + 1 }));
    setStreak(0);
    setLastDifficulty(question.difficulty);
    setLastWasCorrect(false);
  }

  /** User clicks "Skip" — count as skipped, don't show answer, advance. */
  function skip() {
    setStats((s) => ({ ...s, skipped: s.skipped + 1, total: s.total + 1 }));
    setStreak(0);
    setLastDifficulty(question?.difficulty);
    setLastWasCorrect(false);
    void loadNext();
  }

  /** Triggered when user clicks End session — show summary first. */
  function requestEnd() {
    if (stats.total === 0 && attempt.status === 'idle') {
      // No progress yet, just leave silently.
      onEnd();
      return;
    }
    setShowEndSummary(true);
  }

  const isTestDone = mode === 'test' && stats.total >= TEST_LENGTH && attempt.status !== 'idle' && attempt.status !== 'wrong-retry';
  // "Next" button shows when the current question is done — either correct, or
  // user has revealed the solution. wrong-retry stays in retry state.
  const showNext = (attempt.status === 'correct' || attempt.status === 'wrong-revealed') && !isTestDone;

  // ─── Test summary ────────────────────────────────────────────────────
  if (isTestDone) {
    const correct = stats.firstTry + stats.retried;
    const pct = stats.total > 0 ? Math.round((correct / stats.total) * 100) : 0;
    return (
      <div className="max-w-xl mx-auto p-4">
        <Card className="text-center">
          <CardBody>
            <Wizard mood="happy" size={120} className="mx-auto mb-3" />
            <h2 className="font-display text-3xl font-bold text-ink-900 mb-1">Test complete!</h2>
            <p className="text-ink-600 mb-6">Here&apos;s how you did.</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="Score" value={`${correct}/${stats.total}`} />
              <Stat label="Accuracy" value={`${pct}%`} />
              <Stat label="XP earned" value={`+${stats.xp}`} />
            </div>
            <Button onClick={onEnd} variant="primary" size="lg" className="w-full">
              Back to modules
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────
  if (loading && !question) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <Card>
          <CardBody className="text-center py-12">
            <Wizard mood="thinking" size={120} className="mx-auto mb-3" />
            <p className="font-display text-lg text-ink-600">Brewing a question…</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ─── Error (no current question to fall back to) ─────────────────────
  if (error && !question) {
    const isQuotaError = /rate-limited|exceeded.*quota|no.*provider/i.test(error);
    return (
      <div className="max-w-xl mx-auto p-4">
        <Card>
          <CardBody className="text-center py-10">
            <Wizard mood="oops" size={100} className="mx-auto mb-3" />
            <h3 className="font-display text-xl font-bold mb-2">
              {isQuotaError ? 'AI quota reached' : 'Hmm, that didn’t work.'}
            </h3>
            <p className="text-sm text-ink-600 mb-4 max-w-md mx-auto">{error}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button variant="secondary" onClick={onEnd}>← Modules</Button>
              {isQuotaError && (
                <a href="/settings"><Button variant="primary">Open Settings</Button></a>
              )}
              <Button onClick={() => loadNext()}>↻ Try again</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!question) return null;

  // ─── Main practice card ──────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      {/* Inline error banner — shows when fetching the NEXT question fails
          but we still have the previous one rendered. */}
      {error && question && (
        <div className="rounded-xl bg-ember-50 border-2 border-ember-200 p-3 text-sm text-ember-900 flex items-start gap-3 animate-slide-down">
          <span aria-hidden className="text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <div className="font-bold mb-0.5">Couldn’t load the next question</div>
            <div className="text-xs text-ember-800">{error}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => { setError(null); loadNext(); }}>
            ↻ Retry
          </Button>
        </div>
      )}

      {/* Compact header: stats + difficulty + provider */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-ink-500 truncate">
          {mode === 'test'
            ? `Question ${Math.min(stats.total + 1, TEST_LENGTH)} / ${TEST_LENGTH}`
            : `Practice • ${stats.total} answered`}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <ProviderBadge provider={providerInfo.provider} source={providerInfo.source} />
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold',
              DIFFICULTY_LABELS[question.difficulty].color,
            )}
          >
            {DIFFICULTY_LABELS[question.difficulty].name}
          </span>
        </div>
      </div>

      {/* Question card — dimmed + non-interactive while loading the next one */}
      <Card className={cn('relative transition-opacity', loading && 'opacity-50 pointer-events-none')}>
        {loading && (
          <div
            className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-wizard-100 text-wizard-700 px-3 py-1 text-2xs font-bold uppercase tracking-wider z-10 shadow-sm"
            aria-live="polite"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-wizard-500 animate-pulse" />
            Loading next…
          </div>
        )}
        <CardBody>
          <div className="flex items-start gap-3 mb-4">
            <Wizard mood={wizardMood} size={56} animated />
            <div className="flex-1">
              <p className="text-2xs uppercase tracking-wider text-ink-500 font-bold mb-1">
                {reason}
              </p>
              <div className="text-lg sm:text-xl font-medium text-ink-900 leading-relaxed">
                <MathRender>{question.prompt}</MathRender>
              </div>
            </div>
          </div>

          <AnswerInput
            expectedType={question.answer.type}
            choices={
              question.answer.type === 'multipleChoice' ? question.answer.options : undefined
            }
            value={answer}
            onChange={setAnswer}
            onSubmit={submit}
            disabled={attempt.status !== 'idle'}
            status={
              attempt.status === 'correct' ? 'correct'
              : (attempt.status === 'wrong-retry' || attempt.status === 'wrong-revealed') ? 'wrong'
              : 'idle'
            }
            autoFocus
          />

          <div className="mt-4">
            {attempt.status === 'idle' && (
              <HintLadder
                key={question.id}
                hints={question.hints}
                onHintRevealed={setHintsUsed}
                onRevealSolution={reveal}
              />
            )}

            {attempt.status === 'correct' && (
              <div className="rounded-xl bg-leaf-50 border-2 border-leaf-200 p-4 animate-pop">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🎉</span>
                  <span className="font-display font-bold text-leaf-900">
                    {streak >= 5 ? 'Unstoppable!' : streak >= 3 ? 'On a roll!' : 'Correct!'}
                  </span>
                  <span className="ml-auto text-sm font-bold text-spell-700">
                    +{attempt.xpEarned} XP
                  </span>
                </div>
              </div>
            )}

            {attempt.status === 'wrong-retry' && (
              <div className="rounded-xl bg-ember-50 border-2 border-ember-200 p-4 animate-pop">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">💪</span>
                  <span className="font-display font-bold text-ember-900">
                    Not quite. {attempt.attempts === 1 ? 'Want to try again?' : `That was attempt ${attempt.attempts}.`}
                  </span>
                </div>
                <p className="text-sm text-ember-800 mb-3">
                  Take another look at the problem. You can try again, see the solution, or skip to the next.
                </p>
              </div>
            )}

            {attempt.status === 'wrong-revealed' && (
              <div className="space-y-3 animate-slide-down">
                <div className="rounded-xl bg-ember-50 border-2 border-ember-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📖</span>
                    <span className="font-display font-bold text-ember-900">Here&apos;s the answer</span>
                  </div>
                  <div className="text-sm text-ember-800">
                    Correct answer:{' '}
                    <span className="font-mono font-bold text-ember-900">
                      <MathRender>{attempt.expectedDisplay}</MathRender>
                    </span>
                  </div>
                </div>
                <SolutionPanel steps={question.solution} />
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Footer actions — different controls per state */}
      <div className="flex flex-wrap items-center gap-2">
        {attempt.status === 'idle' && (
          <>
            <Button onClick={submit} disabled={!answer.trim()} size="lg" className="flex-1 min-w-[200px]">
              Submit answer
            </Button>
            {/* Allow skip even in idle, only after first attempt */}
            {attempt.attempts > 0 && (
              <Button variant="ghost" size="lg" onClick={skip}>
                Skip →
              </Button>
            )}
          </>
        )}

        {attempt.status === 'wrong-retry' && (
          <>
            <Button onClick={tryAgain} size="lg" variant="primary" className="flex-1 min-w-[160px]">
              ↺ Try again
            </Button>
            <Button onClick={reveal} size="lg" variant="secondary">
              See solution
            </Button>
            <Button onClick={skip} size="lg" variant="ghost">
              Skip →
            </Button>
          </>
        )}

        {showNext && (
          <Button onClick={() => loadNext()} size="lg" className="flex-1 min-w-[200px]" variant="primary">
            Next question →
          </Button>
        )}

        <Button variant="ghost" size="lg" onClick={requestEnd}>
          End session
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-500 px-1">
        <span>Streak {streak} 🔥</span>
        <span>{stats.firstTry + stats.retried}/{stats.total} correct</span>
        <span>+{stats.xp} XP this session</span>
        <span>{formatDuration(Date.now() - questionStart)}</span>
      </div>

      {/* End-session highlights popup */}
      <SessionEndSummary
        open={showEndSummary}
        onKeepPracticing={() => setShowEndSummary(false)}
        onLeave={() => {
          setShowEndSummary(false);
          onEnd();
        }}
        mode={mode}
        firstTry={stats.firstTry}
        retried={stats.retried}
        sawSolution={stats.saw}
        skipped={stats.skipped}
        totalQuestions={stats.total}
        xpEarned={stats.xp}
        bestStreak={bestStreak}
        durationMs={Date.now() - sessionStart}
        skillCounts={skillCounts}
        skillNames={skillNamesById}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="font-display font-bold text-2xl text-ink-900">{value}</div>
      <div className="text-xs text-ink-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

/**
 * Translate API error payloads into messages a kid (or their parent) can act on.
 * The big case is "every provider failed" — we want to say WHY each one
 * failed (rate-limit / auth / etc) so the user knows what to fix.
 */
function friendlyError(j: {
  error?: string;
  detail?: string;
  attempts?: Array<{ provider: string; ok: boolean; error?: string }>;
}): string {
  if (j.error === 'no-providers') {
    return 'No AI provider configured. Open Settings → AI Providers and add at least one key (Gemini and Cloudflare are free).';
  }

  if ((j.error === 'all-providers-failed' || j.error === 'generation-failed') && j.attempts && j.attempts.length > 0) {
    const failed = j.attempts.filter((a) => !a.ok);

    // All same reason?
    const reasons = new Set(failed.map((a) => a.error ?? 'error'));
    if (reasons.size === 1 && reasons.has('rate-limit')) {
      const providers = Array.from(new Set(failed.map((a) => a.provider))).join(', ');
      return `All AI providers (${providers}) are rate-limited right now. Add another provider in Settings → AI Providers, or wait a minute.`;
    }

    // Mixed reasons → give a per-provider breakdown.
    const lines = failed.map((a) => `${a.provider}: ${a.error ?? 'error'}`);
    const hasBadRequest = failed.some((a) => a.error === 'bad-request');
    const hasAuth = failed.some((a) => a.error === 'auth');
    const hint = hasBadRequest || hasAuth
      ? ' (Some keys look invalid — try removing and re-adding them in Settings.)'
      : '';

    return `Couldn't generate a question — all providers failed: ${lines.join(' · ')}.${hint}`;
  }

  if (j.error === 'no-skills-found') {
    return "Couldn't find skills for this grade. Try going back and reselecting.";
  }
  return j.detail || j.error || 'Could not load question';
}

import type { AnswerKind } from '@/types/core';
function formatExpected(a: AnswerKind | null | undefined): string {
  if (!a) return '';
  switch (a.type) {
    case 'numeric': return String(a.value);
    case 'fraction': return `$\\frac{${a.numerator}}{${a.denominator}}$`;
    case 'expression': return `$${a.canonical}$`;
    case 'text': return a.value;
    case 'multipleChoice': return a.options[a.correctIndex] ?? '';
  }
}
