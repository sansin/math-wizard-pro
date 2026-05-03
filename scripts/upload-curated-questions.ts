/**
 * Upload curated questions — for hand-curated batches authored inline (e.g.
 * by Claude in chat) without invoking any AI provider's API.
 *
 * Pipeline:
 *   1. Read every JSON file in data/seed/curated/ matching the format below.
 *   2. Validate each batch against the SAME zod schema the production
 *      generator uses (`BatchSchema`).
 *   3. Run each draft through the SAME verifier (`verify()`) the production
 *      pipeline uses — same arithmetic re-evaluation, same fraction parsing,
 *      same expression canonicalization. No bypassing.
 *   4. Compute `prompt_hash` via `hash32()` (same as production).
 *   5. Upsert into `public.questions` with:
 *        source   = 'curated'
 *        provider = 'claude'
 *        verified = true (only if verify() passed)
 *   6. Log accept/reject per question with reason.
 *
 * Idempotent. Safe to re-run. Skips questions whose prompt_hash is already
 * in the table.
 *
 * Expected JSON file format (matches the AI BatchSchema 1:1):
 *
 *   {
 *     "skill_id": "k1.add.single",
 *     "difficulty": 2,
 *     "questions": [
 *       {
 *         "prompt": "Mia has 5 stickers and gets 3 more. How many now?",
 *         "answer": { "type": "numeric", "value": 8 },
 *         "hints": [
 *           { "level": 1, "text": "..." },
 *           { "level": 2, "text": "..." },
 *           { "level": 3, "text": "..." }
 *         ],
 *         "solution": [
 *           { "title": "...", "detail": "...", "state": "..." }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Usage:
 *   npx tsx scripts/upload-curated-questions.ts                    # upload all
 *   npx tsx scripts/upload-curated-questions.ts --dry              # validate only
 *   npx tsx scripts/upload-curated-questions.ts --file path.json   # one file
 *   npx tsx scripts/upload-curated-questions.ts --skill k1.add.single
 */

// MUST be the first import — see scripts/_load-env.ts for why.
import './_load-env';

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verify } from '../src/lib/math/verifier';
import { hash32 } from '../src/lib/utils';
import type { AnswerKind, Hint, SolutionStep } from '../src/types/core';

// ─── Schemas (mirror src/lib/ai/generator.ts exactly) ──────────────────

const AnswerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('numeric'),
    value: z.coerce.number(),
    tolerance: z.coerce.number().optional(),
  }),
  z.object({
    type: z.literal('fraction'),
    numerator: z.coerce.number().int(),
    denominator: z.coerce.number().int(),
  }),
  z.object({ type: z.literal('expression'), canonical: z.string() }),
  z.object({
    type: z.literal('multipleChoice'),
    correctIndex: z.coerce.number().int(),
    options: z.array(z.string()).min(2).max(6),
  }),
  z.object({
    type: z.literal('text'),
    value: z.string(),
    caseSensitive: z.coerce.boolean().optional(),
  }),
]);

const HintSchema = z.object({
  level: z.number().int().min(1).max(3),
  text: z.string().min(3).max(400),
});

const SolutionStepSchema = z.object({
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(500),
  state: z.string().max(120).optional(),
});

const QuestionDraftSchema = z.object({
  prompt: z.string().min(5).max(500),
  answer: AnswerSchema,
  hints: z.array(HintSchema).length(3),
  solution: z.array(SolutionStepSchema).min(1).max(8),
});

const FileSchema = z.object({
  skill_id: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  questions: z.array(QuestionDraftSchema).min(1),
});

type Draft = z.infer<typeof QuestionDraftSchema>;

// ─── CLI args ──────────────────────────────────────────────────────────

interface Args {
  dry: boolean;
  file?: string;
  skill?: string;
  dir: string;
}

function parseArgs(): Args {
  const argv: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) continue;
    argv[m[1]!] = m[2] ?? 'true';
  }
  return {
    dry: argv.dry === 'true' || argv.dryRun === 'true',
    file: argv.file,
    skill: argv.skill,
    dir: argv.dir ?? 'data/seed/curated',
  };
}

// ─── Verification (uses production verify() helper) ────────────────────

function verifyDraft(d: Draft): { ok: true; answer: AnswerKind } | { ok: false; reason: string } {
  const expectedKind = d.answer.type;
  const rawAnswer = (() => {
    switch (d.answer.type) {
      case 'numeric': return d.answer.value;
      case 'fraction': return `${d.answer.numerator}/${d.answer.denominator}`;
      case 'expression': return d.answer.canonical;
      case 'multipleChoice': return d.answer.correctIndex;
      case 'text': return d.answer.value;
    }
  })();
  const metadata = d.answer.type === 'multipleChoice'
    ? { options: d.answer.options }
    : undefined;
  return verify({
    prompt: d.prompt,
    rawAnswer,
    expectedKind,
    metadata,
  });
}

// ─── Main ──────────────────────────────────────────────────────────────

interface FileResult {
  file: string;
  skill_id: string;
  difficulty: number;
  total: number;
  accepted: number;
  rejected: Array<{ prompt: string; reason: string }>;
  inserted: number;
  skipped: number; // already in DB
}

async function main() {
  const args = parseArgs();
  console.log('🪄 Curated question uploader');
  console.log(`   dir:  ${args.dir}`);
  if (args.file) console.log(`   file: ${args.file}`);
  if (args.skill) console.log(`   skill filter: ${args.skill}`);
  if (args.dry) console.log('   dry:  ON (validate only, no DB writes)');

  // ── Discover files ───────────────────────────────────────────────────
  const files: string[] = [];
  if (args.file) {
    files.push(resolve(args.file));
  } else {
    const root = resolve(args.dir);
    try {
      walk(root, files);
    } catch (e) {
      console.error(`❌ Could not read ${root}: ${(e as Error).message}`);
      process.exit(1);
    }
  }
  if (files.length === 0) {
    console.error(`❌ No JSON files found.`);
    process.exit(1);
  }
  console.log(`   files: ${files.length}\n`);

  // ── Supabase client (skipped in dry mode) ────────────────────────────
  const sb = args.dry ? null : createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  if (!args.dry && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local');
    process.exit(1);
  }

  const results: FileResult[] = [];

  for (const f of files) {
    const result: FileResult = {
      file: f,
      skill_id: '',
      difficulty: 0,
      total: 0,
      accepted: 0,
      rejected: [],
      inserted: 0,
      skipped: 0,
    };

    let parsed: z.infer<typeof FileSchema>;
    try {
      const raw = JSON.parse(readFileSync(f, 'utf8'));
      parsed = FileSchema.parse(raw);
    } catch (e) {
      console.warn(`   ⚠ ${f}: ${(e as Error).message.slice(0, 200)}`);
      continue;
    }
    result.skill_id = parsed.skill_id;
    result.difficulty = parsed.difficulty;
    result.total = parsed.questions.length;

    if (args.skill && args.skill !== parsed.skill_id) {
      continue; // filter
    }

    console.log(`📄 ${f.replace(process.cwd() + '/', '')}`);
    console.log(`   skill=${parsed.skill_id} d=${parsed.difficulty} count=${parsed.questions.length}`);

    // ── Verify ─────────────────────────────────────────────────────────
    const acceptedDrafts: Array<{ draft: Draft; verifiedAnswer: AnswerKind }> = [];
    for (const draft of parsed.questions) {
      const v = verifyDraft(draft);
      if (!v.ok) {
        result.rejected.push({
          prompt: draft.prompt.slice(0, 80),
          reason: v.reason,
        });
        continue;
      }
      acceptedDrafts.push({ draft, verifiedAnswer: v.answer });
      result.accepted++;
    }
    console.log(`   verify: ${result.accepted}/${result.total} accepted`);
    for (const r of result.rejected) {
      console.log(`     ✗ ${r.reason} | "${r.prompt}"`);
    }

    if (args.dry || acceptedDrafts.length === 0) {
      results.push(result);
      continue;
    }

    // ── Existing prompt_hash check (skip duplicates) ──────────────────
    const candidateHashes = acceptedDrafts.map(({ draft }) => hash32(draft.prompt));
    const { data: existing } = await sb!
      .from('questions')
      .select('prompt_hash')
      .in('prompt_hash', candidateHashes);
    const existingSet = new Set((existing ?? []).map((r: { prompt_hash: string }) => r.prompt_hash));

    const inserts = acceptedDrafts
      .map(({ draft, verifiedAnswer }) => ({ draft, verifiedAnswer, hash: hash32(draft.prompt) }))
      .filter(({ hash }) => {
        const dup = existingSet.has(hash);
        if (dup) result.skipped++;
        return !dup;
      })
      .map(({ draft, verifiedAnswer, hash }) => ({
        prompt_hash: hash,
        skill_id: parsed.skill_id,
        difficulty: parsed.difficulty,
        prompt: draft.prompt,
        answer: verifiedAnswer,
        hints: draft.hints as [Hint, Hint, Hint],
        solution: draft.solution as SolutionStep[],
        source: 'curated' as const,
        provider: 'claude' as const,
        verified: true,
      }));

    if (inserts.length === 0) {
      console.log(`   insert: 0 (all ${result.skipped} duplicates)\n`);
      results.push(result);
      continue;
    }

    const { error: insErr, count } = await sb!
      .from('questions')
      .upsert(inserts, { onConflict: 'prompt_hash', count: 'exact' });

    if (insErr) {
      console.warn(`   ⚠ upsert failed: ${insErr.message}`);
      results.push(result);
      continue;
    }
    result.inserted = count ?? inserts.length;
    console.log(`   insert: +${result.inserted} new (${result.skipped} duplicates skipped)\n`);
    results.push(result);
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log('━'.repeat(60));
  const totals = results.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      accepted: acc.accepted + r.accepted,
      rejected: acc.rejected + r.rejected.length,
      inserted: acc.inserted + r.inserted,
      skipped: acc.skipped + r.skipped,
    }),
    { total: 0, accepted: 0, rejected: 0, inserted: 0, skipped: 0 },
  );
  console.log(`✨ Done.`);
  console.log(`   files processed: ${results.length}`);
  console.log(`   drafts:          ${totals.total}`);
  console.log(`   verifier passed: ${totals.accepted}`);
  console.log(`   verifier failed: ${totals.rejected}`);
  console.log(`   inserted:        ${totals.inserted}`);
  console.log(`   already in DB:   ${totals.skipped}`);
}

function walk(root: string, out: string[]): void {
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, out);
    } else if (entry.endsWith('.json')) {
      out.push(p);
    }
  }
}

main().catch((e) => {
  console.error('❌ Crashed:', e);
  process.exit(1);
});
