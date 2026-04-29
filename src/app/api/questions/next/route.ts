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

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveKeysForUser, bumpSharedUsage } from '@/lib/ai/key-resolver';
import { generateBatch } from '@/lib/ai/generator';
import { pickNext } from '@/lib/mastery/engine';
import type { Skill, SkillMastery } from '@/types/core';

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

  // 3. Try cache: pull a verified question for this skill+difficulty the user
  //    hasn't recently seen.
  const { data: cacheRows } = await sb
    .from('questions')
    .select('id, prompt_hash, prompt, answer, hints, solution, source, provider, difficulty, skill_id, verified, created_at, served_count, correct_count, flagged_count')
    .eq('skill_id', pick.skill.id)
    .eq('difficulty', pick.difficulty)
    .eq('verified', true)
    .order('served_count', { ascending: true })
    .limit(20);

  const avoid = new Set(body.avoidPromptHashes);
  const fromCache = (cacheRows ?? []).find(
    (q: Record<string, unknown>) => !avoid.has(q.prompt_hash as string),
  );

  if (fromCache) {
    const r = fromCache as Record<string, unknown>;
    return NextResponse.json({
      source: 'cache',
      reason: pick.reason,
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

  const batch = await generateBatch(
    {
      skill: pick.skill,
      difficulty: pick.difficulty,
      count: 5,
      avoidPromptHashes: body.avoidPromptHashes,
    },
    keys.ctx,
  );

  if (batch.questions.length === 0) {
    return NextResponse.json(
      { error: 'generation-failed', attempts: batch.attempts },
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

  // If any successful provider was an admin key, bump shared usage.
  const usedAdmin = batch.attempts.some(
    (a) => a.ok && (keys.ctx.userKeys[a.provider as keyof typeof keys.ctx.userKeys] === undefined),
  );
  if (usedAdmin) await bumpSharedUsage(userId);

  const first = batch.questions[0]!;
  return NextResponse.json({
    source: 'ai',
    reason: pick.reason,
    question: first,
    attempts: batch.attempts,
    quota: keys.sharedQuota,
  });
}
