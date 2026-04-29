'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Wizard, type WizardMood } from '@/components/Wizard';
import { MathRender } from '@/components/math/MathRender';
import { AnswerInput } from '@/components/math/AnswerInput';
import { HintLadder } from './HintLadder';
import { SolutionPanel } from './SolutionPanel';
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

interface AttemptState {
  status: 'idle' | 'correct' | 'wrong';
  xpEarned: number;
  expectedDisplay: string;
  showSolution: boolean;
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
    status: 'idle', xpEarned: 0, expectedDisplay: '', showSolution: false,
  });
  const [hintsUsed, setHintsUsed] = React.useState(0);
  const [stats, setStats] = React.useState({ correct: 0, total: 0, xp: 0 });
  const [streak, setStreak] = React.useState(0);
  const [recentSkillIds, setRecentSkillIds] = React.useState<string[]>([]);
  const [recentHashes, setRecentHashes] = React.useState<string[]>([]);
  const [lastDifficulty, setLastDifficulty] = React.useState<1 | 2 | 3 | 4 | 5 | undefined>();
  const [lastWasCorrect, setLastWasCorrect] = React.useState<boolean | undefined>();
  const [questionStart, setQuestionStart] = React.useState(0);

  const wizardMood: WizardMood = attempt.status === 'correct'
    ? 'happy'
    : attempt.status === 'wrong'
    ? 'oops'
    : loading ? 'thinking' : 'idle';

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
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNext(sId: string | null = sessionId) {
    setLoading(true);
    setError(null);
    setAnswer('');
    setHintsUsed(0);
    setAttempt({ status: 'idle', xpEarned: 0, expectedDisplay: '', showSolution: false });
    try {
      const res = await fetch('/api/questions/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillIds,
          lastDifficulty,
          lastWasCorrect,
          recentSkillIds: recentSkillIds.slice(-5),
          avoidPromptHashes: recentHashes.slice(-30),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || j.error || 'Could not load question');
      }
      const data = await res.json();
      setQuestion(data.question);
      setReason(data.reason ?? '');
      setQuestionStart(Date.now());
      setRecentSkillIds((s) => [...s.slice(-9), data.question.skillId]);
      setRecentHashes((h) => [...h.slice(-49), data.question.promptHash]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
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

      setAttempt({
        status: correct ? 'correct' : 'wrong',
        xpEarned: data.xpEarned ?? optimisticXP,
        expectedDisplay,
        showSolution: false,
      });
      setStats((s) => ({
        correct: s.correct + (correct ? 1 : 0),
        total: s.total + 1,
        xp: s.xp + (data.xpEarned ?? 0),
      }));
      setStreak((cs) => correct ? cs + 1 : 0);
      setLastDifficulty(question.difficulty);
      setLastWasCorrect(correct);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const isTestDone = mode === 'test' && stats.total >= TEST_LENGTH && attempt.status !== 'idle';
  const showNext = attempt.status !== 'idle' && !isTestDone;

  // ─── Test summary ────────────────────────────────────────────────────
  if (isTestDone) {
    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    return (
      <div className="max-w-xl mx-auto p-4">
        <Card className="text-center">
          <CardBody>
            <Wizard mood="happy" size={120} className="mx-auto mb-3" />
            <h2 className="font-display text-3xl font-bold text-ink-900 mb-1">Test complete!</h2>
            <p className="text-ink-600 mb-6">Here&apos;s how you did.</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="Score" value={`${stats.correct}/${stats.total}`} />
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

  // ─── Error ───────────────────────────────────────────────────────────
  if (error && !question) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <Card>
          <CardBody className="text-center py-10">
            <Wizard mood="oops" size={100} className="mx-auto mb-3" />
            <h3 className="font-display text-xl font-bold mb-2">Hmm, that didn&apos;t work.</h3>
            <p className="text-sm text-ink-600 mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={onEnd}>Back</Button>
              <Button onClick={() => loadNext()}>Try again</Button>
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
      {/* Compact header: stats + difficulty */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-500">
          {mode === 'test'
            ? `Question ${Math.min(stats.total + 1, TEST_LENGTH)} / ${TEST_LENGTH}`
            : `Practice • ${stats.total} answered`}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold',
            DIFFICULTY_LABELS[question.difficulty].color,
          )}
        >
          {DIFFICULTY_LABELS[question.difficulty].name}
        </span>
      </div>

      {/* Question card */}
      <Card>
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
            status={attempt.status}
            autoFocus
          />

          <div className="mt-4">
            {attempt.status === 'idle' && (
              <HintLadder hints={question.hints} onHintRevealed={setHintsUsed} />
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

            {attempt.status === 'wrong' && (
              <div className="space-y-3 animate-slide-down">
                <div className="rounded-xl bg-ember-50 border-2 border-ember-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">💪</span>
                    <span className="font-display font-bold text-ember-900">Not quite — try again next time</span>
                  </div>
                  <div className="text-sm text-ember-800">
                    Correct answer:{' '}
                    <span className="font-mono font-bold text-ember-900">
                      <MathRender>{attempt.expectedDisplay}</MathRender>
                    </span>
                  </div>
                </div>
                {!attempt.showSolution ? (
                  <button
                    type="button"
                    onClick={() => setAttempt((a) => ({ ...a, showSolution: true }))}
                    className="text-sm font-semibold text-wizard-600 hover:text-wizard-700"
                  >
                    📖 Show me the solution
                  </button>
                ) : (
                  <SolutionPanel steps={question.solution} />
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Footer actions */}
      <div className="flex items-center gap-3">
        {attempt.status === 'idle' && (
          <Button onClick={submit} disabled={!answer.trim()} size="lg" className="flex-1">
            Submit answer
          </Button>
        )}
        {showNext && (
          <Button onClick={() => loadNext()} size="lg" className="flex-1" variant="primary">
            Next question →
          </Button>
        )}
        <Button variant="ghost" size="lg" onClick={onEnd}>
          End session
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-500 px-1">
        <span>Streak {streak} 🔥</span>
        <span>{stats.correct}/{stats.total} correct</span>
        <span>+{stats.xp} XP this session</span>
        <span>{formatDuration(Date.now() - questionStart)}</span>
      </div>
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
