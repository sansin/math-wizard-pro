/**
 * POST /api/questions/next
 *
 * Body: { skillIds: string[], lastDifficulty?: 1-5, lastWasCorrect?: boolean,
 *         recentSkillIds?: string[], avoidPromptHashes?: string[] }
 *
 * Returns: { question: Question, reason: string, source: 'cache'|'ai' }
 *
 * Strategy:
 *   1. Use the adaptive engine to pick (skill, difficulty).
 *   2. Try the questions cache first — pull a verified question with a
 *      promptHash the user hasn't seen recently.
 *   3. If cache miss, generate a batch of 5 via the AI router; persist
 *      verified ones; serve one to the user.
 */

import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveKeysForUser, bumpSharedUsage } from '@/lib/ai/key-resolver';
import { generateBatch } from '@/lib/ai/generator';
import { NoProviderError, SPEED_FIRST_ORDER } from '@/lib/ai/router';
import { bumpUsage } from '@/lib/ai/usage-tracker';
import { pickNext } from '@/lib/mastery/engine';
import type { AIProviderId, Skill, SkillMastery } from '@/types/core';

const Body = z.object({
  skillIds: z.array(z.string()).min(1).max(20),
  lastDifficulty: z.number().int().min(1).max(5).optional(),
  lastWasCorrect: z.boolean().optional(),
  recentSkillIds: z.array(z.string()).max(20).default([]),
  avoidPromptHashes: z.array(z.string()).max(50).default([]),
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const userClient = await getServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = auth.user.id;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid-body', detail: (e as Error).message }, { status: 400 });
  }

  const sb = getServiceClient();

  // 1. Load skills + mastery
  const { data: skillRows } = await sb
    .from('skills')
    .select('*')
    .in('id', body.skillIds);
  const skills: Skill[] = (skillRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    module: r.module as string,
    topic: r.topic as string,
    gradeBand: r.grade_band as Skill['gradeBand'],
    intrinsicDifficulty: r.intrinsic_difficulty as Skill['intrinsicDifficulty'],
    prerequisites: (r.prerequisites as string[]) ?? [],
    standards: (r.standards as string[]) ?? [],
  }));
  if (skills.length === 0) {
    return NextResponse.json({ error: 'no-skills-found' }, { status: 404 });
  }

  const { data: masteryRows } = await sb
    .from('skill_mastery')
    .select('*')
    .eq('user_id', userId)
    .in('skill_id', body.skillIds);
  const masteryMap = new Map<string, SkillMastery>();
  for (const r of (masteryRows ?? []) as Array<Record<string, unknown>>) {
    masteryMap.set(r.skill_id as string, {
      userId,
      skillId: r.skill_id as string,
      mastery: Number(r.mastery),
      confidence: Number(r.confidence),
      attempts: Number(r.attempts),
      correctStreak: Number(r.correct_streak),
      lastAttemptAt: (r.last_attempt_at as string) ?? null,
      dueAt: (r.due_at as string) ?? null,
      avgCorrectDifficulty: Number(r.avg_correct_difficulty),
    });
  }

  // 2. Adaptive pick
  const pick = pickNext({
    candidates: skills,
    mastery: masteryMap,
    recentSkillIds: body.recentSkillIds,
    lastWasCorrect: body.lastWasCorrect,
    lastDifficulty: body.lastDifficulty as 1 | 2 | 3 | 4 | 5 | undefined,
  });

  // 3. Try cache. To minimize AI calls we look at the EXACT difficulty
  //    first, then nearby difficulties (±1). Adjacent-difficulty fallback
  //    keeps the user practicing instead of burning a generation cycle
  //    when the exact level happens to be empty.
  //
  //    "Avoid" set merges TWO sources:
  //      • body.avoidPromptHashes — sent by the client, hashes from the
  //        current session
  //      • recently-attempted question_ids from the attempts table —
  //        prevents serving questions the user already did in PREVIOUS
  //        sessions (no repeats unless we've truly exhausted the pool)
  const targetDifficulties = [
    pick.difficulty,
    Math.min(5, pick.difficulty + 1),
    Math.max(1, pick.difficulty - 1),
  ].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

  // Pull the user's recent attempt IDs in parallel with the cache lookup.
  // Limit 200 = ~last several sessions; pool typically <50 per (skill,diff)
  // so this safely covers cross-session deduplication without bloating.
  //
  // The questions table is GLOBAL across all users — every verified
  // generation feeds the same pool. Per-user "have I seen this?" filtering
  // happens via the attempts table, not by partitioning the cache.
  const [{ data: cacheRows }, { data: recentAttemptRows }] = await Promise.all([
    sb
      .from('questions')
      .select('id, prompt_hash, prompt, answer, hints, solution, source, provider, difficulty, skill_id, verified, created_at, served_count, correct_count, flagged_count')
      .eq('skill_id', pick.skill.id)
      .in('difficulty', targetDifficulties)
      .eq('verified', true)
      // Quality filter: skip questions that have been flagged 3+ times.
      // Flags accumulate when users click "report" on a bad question;
      // 3 reports = enough signal to retire it from the active pool.
      .lt('flagged_count', 3)
      .order('served_count', { ascending: true })
      // 300 = covers up to ~3 difficulties × 100 questions each. Keeps
      // the response small enough to be fast (one round-trip, ≈300 rows
      // of ≈2 KB each = ~0.6 MB) while ensuring dedup never runs out
      // of candidates while there are still unseen questions in the pool.
      .limit(300),
    sb
      .from('attempts')
      .select('question_id')
      .eq('user_id', userId)
      // Per-skill filter: dedup is "don't show this user the same
      // question on this skill again". Without this filter, a user
      // who has answered 200+ questions on OTHER skills can have
      // their per-skill history fall out of the .limit() window,
      // and the server happily re-serves a question they've seen.
      .eq('skill_id', pick.skill.id)
      .order('attempted_at', { ascending: false })
      .limit(500),
  ]);

  const avoidHashes = new Set(body.avoidPromptHashes);
  const userSeenIds = new Set(
    (recentAttemptRows ?? []).map((r) => (r as { question_id: string }).question_id),
  );

  // De-prioritize questions that have a low correctness rate AFTER enough
  // plays. A question with 1/10 correct after being shown to 10 users is
  // probably broken (wrong answer, ambiguous, etc.) — push it to the back
  // of the candidate list. We don't drop it entirely (sometimes a hard
  // question is just hard); we just let the verified-good ones surface
  // first.
  const cached = ((cacheRows ?? []) as Array<Record<string, unknown>>)
    .map((q) => {
      const served = Number(q.served_count) || 0;
      const correct = Number(q.correct_count) || 0;
      const correctRate = served >= 10 ? correct / served : 1; // assume good until proven otherwise
      return { q, correctRate };
    })
    .sort((a, b) => {
      // Primary sort: correctness rate (desc) when both have enough data.
      const aReliable = (a.q.served_count as number) >= 10;
      const bReliable = (b.q.served_count as number) >= 10;
      if (aReliable && bReliable) return b.correctRate - a.correctRate;
      // Secondary: served_count ascending (spread load).
      return (a.q.served_count as number) - (b.q.served_count as number);
    })
    .map((x) => x.q);

  // Helper: a question is "available" if neither its hash is in the
  // session-avoid set nor its id is in the user's recent attempts.
  const isAvailable = (q: Record<string, unknown>) =>
    !avoidHashes.has(q.prompt_hash as string) && !userSeenIds.has(q.id as string);

  // Prefer exact difficulty, then +1, then -1. Within a difficulty bucket,
  // pick the LEAST-served question first (already pre-sorted by SQL).
  let fromCache: Record<string, unknown> | undefined;
  let fromCacheReason: 'exact' | 'adjacent' | 'reused' | undefined;
  for (const d of targetDifficulties) {
    fromCache = cached.find((q) => q.difficulty === d && isAvailable(q));
    if (fromCache) {
      fromCacheReason = d === pick.difficulty ? 'exact' : 'adjacent';
      break;
    }
  }

  // Last-resort: if the user has cycled through every cached question
  // and we'd otherwise generate fresh, prefer reusing a CACHED question
  // they haven't seen this session (even if they saw it long ago) over
  // burning an AI call.
  if (!fromCache) {
    fromCache = cached.find((q) => !avoidHashes.has(q.prompt_hash as string));
    if (fromCache) fromCacheReason = 'reused';
  }

  console.log(
    `[questions/next] skill=${pick.skill.id} target=d${pick.difficulty} ` +
    `pool=${cached.length} (across d${targetDifficulties.join(',')}) ` +
    `session-avoid=${avoidHashes.size} user-seen=${userSeenIds.size} ` +
    `served=${fromCache ? `cache:${(fromCache.prompt_hash as string).slice(0, 6)}@d${fromCache.difficulty}/${fromCacheReason}` : 'will-generate'}`,
  );

  if (fromCache) {
    const r = fromCache as Record<string, unknown>;
    return NextResponse.json({
      source: 'cache',
      reason: pick.reason,
      provider: (r.provider as string) ?? null,
      providerSource: 'cache',
      question: {
        id: r.id,
        promptHash: r.prompt_hash,
        skillId: r.skill_id,
        difficulty: r.difficulty,
        prompt: r.prompt,
        answer: r.answer,
        hints: r.hints,
        solution: r.solution,
        source: r.source,
        provider: r.provider,
        verified: true,
        createdAt: r.created_at,
      },
    });
  }

  // 4. Cache miss → AI generation
  const keys = await resolveKeysForUser(userId);
  if (keys.byok.length === 0 && keys.shared.length === 0) {
    return NextResponse.json(
      {
        error: 'no-providers',
        detail:
          'No AI provider available. Add an API key in Settings → AI Providers, or contact the admin.',
      },
      { status: 422 },
    );
  }

  // Cold-path optimization: when there are NO cached questions for this
  // (skill, difficulty±1), generate just 1 question with the fastest
  // providers first so the user sees something quickly. Then, AFTER the
  // response is sent, schedule a background generation of 4 more to fill
  // the cache for subsequent users (uses Next.js `after()`).
  const isColdPath = cached.length === 0;
  const requestedCount = isColdPath ? 1 : 5;

  let batch;
  try {
    batch = await generateBatch(
      {
        skill: pick.skill,
        difficulty: pick.difficulty,
        count: requestedCount,
        avoidPromptHashes: body.avoidPromptHashes,
      },
      keys.ctx,
      isColdPath ? { order: SPEED_FIRST_ORDER, timeoutMs: 25_000 } : undefined,
    );
  } catch (e) {
    // The router threw NoProviderError because every configured provider
    // failed (rate-limit / auth / etc). Surface a structured 502 so the
    // client can render a useful message.
    if (e instanceof NoProviderError) {
      return NextResponse.json(
        {
          error: 'all-providers-failed',
          detail:
            'All configured AI providers errored. Add another provider in Settings → AI Providers, or wait a minute and retry.',
          attempts: e.attempts,
          configuredCount: keys.byok.length + keys.shared.length,
          byokCount: keys.byok.length,
          adminCount: keys.shared.length,
        },
        { status: 502 },
      );
    }
    throw e;
  }

  if (batch.questions.length === 0) {
    return NextResponse.json(
      {
        error: 'generation-failed',
        attempts: batch.attempts,
        configuredCount: keys.byok.length + keys.shared.length,
        byokCount: keys.byok.length,
        adminCount: keys.shared.length,
      },
      { status: 502 },
    );
  }

  // Persist all verified questions to the cache.
  const insertRows = batch.questions.map((q) => ({
    id: q.id,
    prompt_hash: q.promptHash,
    skill_id: q.skillId,
    difficulty: q.difficulty,
    prompt: q.prompt,
    answer: q.answer,
    hints: q.hints,
    solution: q.solution,
    source: q.source,
    provider: q.provider,
    verified: true,
  }));
  await sb.from('questions').upsert(insertRows, { onConflict: 'prompt_hash' });

  // Track per-key usage. The router records which provider actually
  // succeeded and whether it came from the user's BYOK or admin keys —
  // we credit the right bucket so the Settings UI can show usage per key.
  const winning = batch.attempts.find((a) => a.ok);
  if (winning) {
    const tokensThisCall = batch.questions.length * 1500; // rough estimate
    await bumpUsage(
      userId,
      winning.provider as AIProviderId,
      winning.source ?? 'admin',
      tokensThisCall,
    ).catch(() => { /* non-fatal */ });
  }

  // If any successful provider was an admin key, bump shared-key daily quota.
  const usedAdmin = batch.attempts.some(
    (a) => a.ok && (keys.ctx.userKeys[a.provider as keyof typeof keys.ctx.userKeys] === undefined),
  );
  if (usedAdmin) await bumpSharedUsage(userId);

  const first = batch.questions[0]!;
  // Identify the provider that actually succeeded — this is what we surface
  // in the UI so users can see "powered by Gemini" / "Claude" etc.
  const winningAttempt = batch.attempts.find((a) => a.ok);

  // Cold-path warm-up: schedule a background generation of 4 more
  // questions across DIFFERENT difficulties so the cache covers the
  // fuzzy-match window (D-1, D, D+1). Without this, every difficulty
  // bump triggers a fresh cold-path call.
  if (isColdPath && batch.questions.length === 1) {
    const skill = pick.skill;
    const difficulty = pick.difficulty;
    const userKeys = keys.ctx;
    const firstHash = first.promptHash;
    const avoidForRefill = [...body.avoidPromptHashes, firstHash];

    // Spread the warm-up: 2 at current difficulty, 1 at +1, 1 at -1.
    const warmupTargets: Array<{ difficulty: 1 | 2 | 3 | 4 | 5; count: number }> = [
      { difficulty, count: 2 },
    ];
    if (difficulty < 5) warmupTargets.push({ difficulty: (difficulty + 1) as 1 | 2 | 3 | 4 | 5, count: 1 });
    if (difficulty > 1) warmupTargets.push({ difficulty: (difficulty - 1) as 1 | 2 | 3 | 4 | 5, count: 1 });

    after(async () => {
      let totalAdded = 0;
      const sb2 = getServiceClient();
      // Run sequentially so we don't fire 3 API calls at once and trigger rate limits.
      for (const t of warmupTargets) {
        try {
          const refill = await generateBatch(
            { skill, difficulty: t.difficulty, count: t.count, avoidPromptHashes: avoidForRefill },
            userKeys,
          );
          if (refill.questions.length > 0) {
            await sb2.from('questions').upsert(
              refill.questions.map((q) => ({
                id: q.id,
                prompt_hash: q.promptHash,
                skill_id: q.skillId,
                difficulty: q.difficulty,
                prompt: q.prompt,
                answer: q.answer,
                hints: q.hints,
                solution: q.solution,
                source: q.source,
                provider: q.provider,
                verified: true,
              })),
              { onConflict: 'prompt_hash' },
            );
            totalAdded += refill.questions.length;
          }
        } catch (e) {
          console.warn(`[questions/next] warm-up at d${t.difficulty} failed: ${(e as Error).message}`);
        }
      }
      console.log(`[questions/next] cold-path warmed cache: skill=${skill.id} +${totalAdded} across difficulties ${warmupTargets.map((t) => 'd' + t.difficulty).join(',')}`);
    });
  }

  return NextResponse.json({
    source: 'ai',
    reason: pick.reason,
    question: first,
    provider: winningAttempt?.provider ?? first.provider ?? null,
    providerSource: winningAttempt?.source ?? null, // 'user' | 'admin'
    attempts: batch.attempts,
    quota: keys.sharedQuota,
    coldPath: isColdPath,
  });
}
