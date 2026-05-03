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

import 'dotenv/config';
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
          { timeoutMs: 60_000 },
        );
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
        console.log(`    ↳ +${batch.questions.length} via ${winningProvider} (total +${added}/${job.need})`);
      } catch (e) {
        const msg = (e as Error).message ?? '';
        console.warn(`    ↳ attempt ${attempts} failed: ${msg.slice(0, 200)}`);
        // Long backoff if we're rate-limited
        if (msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('quota')) {
          console.log('    ↳ backing off 30s due to rate limit...');
          await new Promise((r) => setTimeout(r, 30_000));
        }
      }
    }

    totalAdded += added;
    if (added < job.need) {
      console.warn(`    ⚠ only got ${added}/${job.need} for ${job.skill.id} d${job.difficulty}`);
    }
  }

  const wallSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n✅ Done. Added ${totalAdded} questions in ${wallSeconds}s.`);
  if (totalRejected > 0) console.log(`   (${totalRejected} batches rejected by verification)`);
}

main().catch((e) => {
  console.error('❌ Seeder crashed:', e);
  process.exit(1);
});
