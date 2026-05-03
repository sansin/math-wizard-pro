/**
 * Cache seeding script — bulk-populate the questions table with verified
 * AI-generated questions across every (skill, difficulty) combination.
 *
 * Usage:
 *   npx tsx scripts/seed-cache.ts                    # default: 20 per (skill, diff)
 *   npx tsx scripts/seed-cache.ts --target=50        # 50 per (skill, diff)
 *   npx tsx scripts/seed-cache.ts --skill=g23.add.regroup --difficulty=3 --target=10
 *   npx tsx scripts/seed-cache.ts --gradeBand=2-3   # only one grade band
 *
 * Reads from .env.local — the same env vars Vercel uses. Specifically needs:
 *   - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - At least one AI provider key (GEMINI_API_KEY recommended)
 *
 * Idempotent: skips (skill, difficulty) pairs that already have ≥ target
 * cached questions. Re-run safely after a crash, rate-limit, or to top up.
 *
 * The script reuses the production generator + router so seeded questions
 * go through the EXACT same verification pipeline as live traffic.
 *
 * Time/cost estimates (defaults, 20 per (skill,diff) → 5,800 questions):
 *   - With Gemini free tier (1500 RPD): ~4-5 hours wall time
 *   - With Cloudflare Workers AI (10K Neurons/day): ~1-2 hours
 *   - With both + Groq + Cerebras free tiers: <1 hour
 *   - Cost: $0 with free tiers; ~$1-3 with paid Claude/OpenAI
 */

// MUST be the first import — guarantees .env.local is loaded before any
// other module reads process.env. (router.ts captures AI_PROVIDER_ORDER
// at module-load time, so loading env later is too late.)
import './_load-env';

import { createClient } from '@supabase/supabase-js';
import { generateBatch } from '../src/lib/ai/generator';
import type { RouterContext } from '../src/lib/ai/router';
import type { AIProviderId, Skill } from '../src/types/core';

// ─── CLI args ───────────────────────────────────────────────────────────

interface CliArgs {
  target: number;
  skill?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  gradeBand?: string;
  batchSize: number;
  parallelism: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) continue;
    args[m[1]!] = m[2] ?? 'true';
  }
  return {
    target: parseInt(args.target ?? '20', 10),
    skill: args.skill,
    difficulty: args.difficulty ? (parseInt(args.difficulty, 10) as 1 | 2 | 3 | 4 | 5) : undefined,
    gradeBand: args.gradeBand,
    batchSize: parseInt(args.batchSize ?? '5', 10),
    parallelism: parseInt(args.parallelism ?? '1', 10),
    dryRun: args.dryRun === 'true',
  };
}

// ─── AI provider context (admin keys from env) ──────────────────────────

function buildAdminContext(): RouterContext {
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const adminKeys: Partial<Record<AIProviderId, string>> = {
    gemini: process.env.GEMINI_API_KEY || undefined,
    claude: process.env.ANTHROPIC_API_KEY || undefined,
    openai: process.env.OPENAI_API_KEY || undefined,
    deepseek: process.env.DEEPSEEK_API_KEY || undefined,
    groq: process.env.GROQ_API_KEY || undefined,
    cerebras: process.env.CEREBRAS_API_KEY || undefined,
    cloudflare: cfAccount && cfToken ? `${cfAccount}:${cfToken}` : undefined,
    openrouter: process.env.OPENROUTER_API_KEY || undefined,
    mistral: process.env.MISTRAL_API_KEY || undefined,
    huggingface: process.env.HUGGINGFACE_API_KEY || undefined,
  };
  return {
    userKeys: {},
    adminKeys,
    canUseSharedKeys: true,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  console.log(`🌱 Cache seeder starting`);
  console.log(`   target: ${args.target} questions per (skill, difficulty)`);
  console.log(`   batchSize: ${args.batchSize} per AI call`);
  console.log(`   parallelism: ${args.parallelism}`);
  if (args.skill) console.log(`   filter skill: ${args.skill}`);
  if (args.difficulty) console.log(`   filter difficulty: ${args.difficulty}`);
  if (args.gradeBand) console.log(`   filter gradeBand: ${args.gradeBand}`);
  if (args.dryRun) console.log(`   dryRun: ON (no DB writes, no AI calls)`);

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const ctx = buildAdminContext();
  const availableProviders = Object.entries(ctx.adminKeys)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (availableProviders.length === 0) {
    console.error('❌ No AI provider keys found in env. Set at least GEMINI_API_KEY in .env.local.');
    process.exit(1);
  }
  if (availableProviders.length === 1) {
    console.warn(
      `⚠ Only 1 provider key detected (${availableProviders[0]}). ` +
      `If this provider rate-limits, the run will stall. ` +
      `Recommended: set 3+ free-tier keys (GEMINI, CLOUDFLARE_*, GROQ, CEREBRAS) for resilience. ` +
      `Continuing in 3s — Ctrl+C to abort.`,
    );
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`   providers: [${availableProviders.join(', ')}]`);

  // Load skills
  let skillsQ = sb.from('skills').select('*');
  if (args.skill) skillsQ = skillsQ.eq('id', args.skill);
  if (args.gradeBand) skillsQ = skillsQ.eq('grade_band', args.gradeBand);
  const { data: skillRows, error: skillsErr } = await skillsQ;
  if (skillsErr || !skillRows) {
    console.error(`❌ Failed to load skills:`, skillsErr?.message);
    process.exit(1);
  }
  const skills: Skill[] = (skillRows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    module: r.module as string,
    topic: r.topic as string,
    gradeBand: r.grade_band as Skill['gradeBand'],
    intrinsicDifficulty: r.intrinsic_difficulty as Skill['intrinsicDifficulty'],
    prerequisites: (r.prerequisites as string[]) ?? [],
    standards: (r.standards as string[]) ?? [],
  }));
  console.log(`   skills: ${skills.length}`);

  const difficulties: Array<1 | 2 | 3 | 4 | 5> = args.difficulty
    ? [args.difficulty]
    : [1, 2, 3, 4, 5];

  // Build the work plan: every (skill, difficulty) pair where current
  // count < target. Skips pairs that are already topped up.
  type Job = { skill: Skill; difficulty: 1 | 2 | 3 | 4 | 5; need: number; existing: number };
  const jobs: Job[] = [];
  for (const skill of skills) {
    for (const difficulty of difficulties) {
      const { count } = await sb
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('skill_id', skill.id)
        .eq('difficulty', difficulty)
        .eq('verified', true);
      const existing = count ?? 0;
      const need = Math.max(0, args.target - existing);
      if (need > 0) jobs.push({ skill, difficulty, need, existing });
    }
  }

  const totalToGenerate = jobs.reduce((sum, j) => sum + j.need, 0);
  console.log(`\n📊 Work plan:`);
  console.log(`   ${jobs.length} (skill, difficulty) pairs need topping up`);
  console.log(`   ${totalToGenerate} questions to generate`);
  console.log(`   ${Math.ceil(totalToGenerate / args.batchSize)} estimated AI calls\n`);

  if (args.dryRun) {
    console.log('💤 dryRun set — exiting without generating.');
    return;
  }

  if (totalToGenerate === 0) {
    console.log('✅ Cache is already at or above target for every pair. Nothing to do.');
    return;
  }

  // Process jobs sequentially (or in parallel batches if requested).
  // Sequential is gentler on rate limits and easier to read in logs.
  let totalAdded = 0;
  let totalRejected = 0;
  const startedAt = Date.now();

  // ── Cross-batch provider health tracking ─────────────────────────────
  // When a provider returns rate-limit / quota errors repeatedly, we bench
  // it for the rest of the run. Daily-quota errors (Cloudflare neurons,
  // Gemini RPD, Groq TPD, etc.) won't refresh until midnight, so a short
  // cooldown just lets the provider come back, fail again, and re-bench.
  // We bench permanently for the rest of THIS run; you can re-run
  // tomorrow and the script starts fresh.
  //
  //   - 3 consecutive rate-limit errors → bench for the rest of the run
  //   - 5 consecutive any errors        → bench for the rest of the run
  //   - any success                     → reset failure count
  const providerHealth = new Map<AIProviderId, {
    consecutiveRateLimits: number;
    consecutiveErrors: number;
    benchedUntil: number; // epoch ms; 0 means active; Number.MAX_SAFE_INTEGER = run-permanent
    totalWins: number;
    totalFails: number;
  }>();
  const BENCH_PERMANENT = Number.MAX_SAFE_INTEGER;

  function getHealth(p: AIProviderId) {
    let h = providerHealth.get(p);
    if (!h) {
      h = { consecutiveRateLimits: 0, consecutiveErrors: 0, benchedUntil: 0, totalWins: 0, totalFails: 0 };
      providerHealth.set(p, h);
    }
    return h;
  }

  function unhealthySet(): Set<AIProviderId> {
    const now = Date.now();
    const out = new Set<AIProviderId>();
    for (const [p, h] of providerHealth.entries()) {
      if (h.benchedUntil > now) out.add(p);
    }
    return out;
  }

  function recordAttempts(batchAttempts: Array<{ provider: string; ok: boolean; error?: string }>) {
    const winner = batchAttempts.find((a) => a.ok)?.provider as AIProviderId | undefined;
    for (const a of batchAttempts) {
      const p = a.provider as AIProviderId;
      const h = getHealth(p);
      if (a.ok) {
        h.totalWins++;
        h.consecutiveErrors = 0;
        h.consecutiveRateLimits = 0;
        if (h.benchedUntil) {
          console.log(`    🟢 ${p} back online`);
          h.benchedUntil = 0;
        }
      } else {
        h.totalFails++;
        h.consecutiveErrors++;
        const isRateLimit = (a.error ?? '').toLowerCase().includes('rate') ||
                            (a.error ?? '').toLowerCase().includes('quota');
        if (isRateLimit) h.consecutiveRateLimits++;
        const benchAfter = isRateLimit ? 3 : 5;
        if ((isRateLimit ? h.consecutiveRateLimits : h.consecutiveErrors) >= benchAfter && !h.benchedUntil) {
          // Bench permanently for this run. Daily quotas don't refresh
          // in 30min, so re-trying is wasted RTTs.
          h.benchedUntil = BENCH_PERMANENT;
          console.log(`    🔻 benching ${p} for the rest of this run (${a.error ?? 'unknown'})`);
        }
      }
      // Don't penalize providers that came after the winner — the router
      // short-circuits on first success, so they never even got tried.
      if (winner && a.provider === winner) break;
    }
  }

  for (let jobIdx = 0; jobIdx < jobs.length; jobIdx++) {
    const job = jobs[jobIdx]!;
    let added = 0;
    let attempts = 0;
    const maxAttempts = Math.ceil(job.need / args.batchSize) + 2; // some slack for rejections

    console.log(
      `[${jobIdx + 1}/${jobs.length}] ${job.skill.id} d${job.difficulty}: ` +
      `have ${job.existing}, need +${job.need}`,
    );

    // Pull existing prompt hashes so we don't ask AI for duplicates.
    const { data: existingHashRows } = await sb
      .from('questions')
      .select('prompt_hash')
      .eq('skill_id', job.skill.id)
      .eq('difficulty', job.difficulty)
      .limit(200);
    const avoidHashes = (existingHashRows ?? []).map(
      (r) => (r as { prompt_hash: string }).prompt_hash,
    );

    while (added < job.need && attempts < maxAttempts) {
      attempts++;
      const need = Math.min(args.batchSize, job.need - added);
      try {
        const batch = await generateBatch(
          {
            skill: job.skill,
            difficulty: job.difficulty,
            count: need,
            avoidPromptHashes: avoidHashes.slice(-50),
          },
          ctx,
          { timeoutMs: 60_000, excluded: unhealthySet() },
        );
        recordAttempts(batch.attempts);
        if (batch.questions.length === 0) {
          totalRejected++;
          console.warn(`    ↳ batch returned 0 questions; attempts: ${attempts}/${maxAttempts}`);
          // If providers are exhausted, back off briefly
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        // Persist
        const inserts = batch.questions.map((q) => ({
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
        const { error: insErr } = await sb
          .from('questions')
          .upsert(inserts, { onConflict: 'prompt_hash' });
        if (insErr) {
          console.warn(`    ↳ upsert failed: ${insErr.message}`);
          continue;
        }
        added += batch.questions.length;
        for (const q of batch.questions) avoidHashes.push(q.promptHash);
        const winningProvider = batch.attempts.find((a) => a.ok)?.provider ?? '?';
        const failed = batch.attempts.filter((a) => !a.ok).map((a) => a.provider);
        const failNote = failed.length > 0 ? ` (skipped ${failed.join(',')})` : '';
        console.log(`    ↳ +${batch.questions.length} via ${winningProvider}${failNote} (total +${added}/${job.need})`);
      } catch (e) {
        const err = e as Error & { attempts?: Array<{ provider: string; ok: boolean; error?: string }> };
        const msg = err.message ?? '';
        // If this was a NoProviderError, the router has structured attempt
        // info on the exception — record it so the health tracker can
        // bench providers even when every candidate failed.
        if (Array.isArray(err.attempts)) recordAttempts(err.attempts);
        console.warn(`    ↳ attempt ${attempts} failed: ${msg.slice(0, 200)}`);

        // Long backoff if we're rate-limited
        if (msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('quota')) {
          console.log('    ↳ backing off 30s due to rate limit...');
          await new Promise((r) => setTimeout(r, 30_000));
        }

        // If every provider in our chain has been benched, no amount of
        // retrying will help. Bail this pair (and possibly the whole run).
        if (msg.toLowerCase().includes('no ai provider')) {
          const aliveCount = Object.entries(ctx.adminKeys)
            .filter(([p, v]) => v && !unhealthySet().has(p as AIProviderId))
            .length;
          if (aliveCount === 0) {
            console.warn(`    ⛔ All providers benched. Bailing this pair; will retry next run.`);
            break;
          }
        }
      }
    }

    totalAdded += added;
    if (added < job.need) {
      console.warn(`    ⚠ only got ${added}/${job.need} for ${job.skill.id} d${job.difficulty}`);
    }

    // If everything is benched, stop the entire run — better to exit and
    // resume tomorrow than thrash for hours producing nothing.
    const aliveCount = Object.entries(ctx.adminKeys)
      .filter(([p, v]) => v && !unhealthySet().has(p as AIProviderId))
      .length;
    if (aliveCount === 0) {
      console.warn(`\n⛔ All providers benched (rate-limited or failing). Stopping run early.`);
      console.warn(`   Re-run the same command in a few hours and the script will resume.`);
      break;
    }

    // Every 5 jobs, print provider health summary so the user can see
    // which providers are doing the work.
    if ((jobIdx + 1) % 5 === 0) {
      const elapsed = Math.round((Date.now() - startedAt) / 60_000);
      console.log(`\n  ── provider health (after ${jobIdx + 1} pairs, ${elapsed}min elapsed) ──`);
      const sorted = Array.from(providerHealth.entries())
        .sort((a, b) => b[1].totalWins - a[1].totalWins);
      for (const [p, h] of sorted) {
        const status = h.benchedUntil > Date.now()
          ? `BENCHED until ${new Date(h.benchedUntil).toLocaleTimeString()}`
          : 'active';
        console.log(`     ${p.padEnd(12)} wins=${h.totalWins} fails=${h.totalFails}  [${status}]`);
      }
      console.log('');
    }
  }

  const wallSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n✅ Done. Added ${totalAdded} questions in ${wallSeconds}s.`);
  if (totalRejected > 0) console.log(`   (${totalRejected} batches rejected by verification)`);

  // Final provider health summary
  console.log(`\n📊 Final provider scoreboard:`);
  const sorted = Array.from(providerHealth.entries())
    .sort((a, b) => b[1].totalWins - a[1].totalWins);
  for (const [p, h] of sorted) {
    console.log(`   ${p.padEnd(12)} wins=${h.totalWins.toString().padStart(4)}  fails=${h.totalFails.toString().padStart(4)}`);
  }
}

main().catch((e) => {
  console.error('❌ Seeder crashed:', e);
  process.exit(1);
});
