# Math Wizard Pro — agent guide

Read this BEFORE making changes. It's the high-signal context any
future Claude / GPT / human pair-programmer needs to be productive
in this repo without re-learning what's already been figured out.

For end-user docs, see [`README.md`](README.md). This file is
agent-facing — it covers conventions, gotchas, decision rationale,
and the workflows that aren't obvious from reading the code alone.

---

## What this app is

K-12 adaptive math practice. Students get verified-correct AI-generated
questions, progressive hints that don't spoil the answer, and step-by-step
worked solutions when they get something wrong. v2 successor to a v1
("Classic") app that had bundled API keys and regex-based answer checking.

**Production target:** sandeepsingarapu (the project owner) deploys
this for personal/family use, not a commercial SaaS. Decisions favor
correctness, low operational cost, and minimal moving parts over
hyperscale concerns.

---

## Conventions you must follow

### Code

- **TypeScript strict everywhere.** `noImplicitAny`, `strictNullChecks`,
  and `noUncheckedIndexedAccess` are all on. `arr[i]!` (non-null assertion
  after a known index) is the common pattern when the bounds check is
  obvious to a reader. Don't soften the strictness.
- **No emojis in code, comments, or commits unless the user asks.**
  UI text occasionally uses emojis (📚 for curated bank, 🚩 for report)
  — those are deliberate UX choices.
- **Keep functions small and single-purpose.** Helpers in `src/lib/**`
  should be pure where possible — they're the unit-test surface.
- **Comment the WHY, not the what.** Every non-obvious branch should
  have a `// because…` comment so the next reader doesn't have to
  reverse-engineer intent.

### Git / commits

- Commit messages follow the pattern: `<type>: <short summary>` (e.g.
  `feat: cross-batch provider health tracker`, `fix: dotenv loads
  .env.local before module imports capture process.env`).
- Multi-line commit bodies are encouraged for non-trivial changes.
  Explain the user-facing problem, the cause, and the fix.
- Don't auto-commit on the user's behalf without confirmation — the user
  reviews diffs in their git GUI before pushing.

### File creation rules

- **Don't create new docs unless asked.** README and CLAUDE.md are
  the canonical context. Add to them rather than creating siblings.
- **Don't create one-off scripts in `scripts/_*` unless they're
  permanent.** The gitignore catches `scripts/_test*.{mjs,ts}` —
  use that prefix for ad-hoc throwaway scripts.

---

## Architecture cheat sheet

```
src/lib/             ← pure business logic; HEAVILY UNIT TESTED
  math/              ← parser, checker, verifier, equivalence (mathjs)
  mastery/           ← adaptive engine + XP/levels
  ai/                ← 10-provider router + key encryption + key resolver
  supabase/          ← server + browser clients
  firebase/          ← legacy v1 helpers (migration only)

src/app/api/         ← Next.js route handlers (thin — orchestrate libs)
src/app/**/page.tsx  ← server-rendered pages
src/components/      ← React UI (covered by Playwright e2e, not Vitest)
scripts/             ← seed-cache, audit-questions, upload-curated (admin tools)
data/seed/curated/   ← hand-curated question batches (JSON)
supabase/migrations/ ← schema, RLS, triggers, seed
docs/                ← ARCHITECTURE, SECURITY, SETUP, SEED_CACHE, GO_LIVE
tests/               ← unit (vitest) + integration + e2e (playwright)
```

**The most important file in this repo** is `src/lib/math/verifier.ts`.
It's the trust boundary — every question shipped to a student must pass
through it. If you change verifier semantics, run `npm run audit:fix:full`
on the whole pool and bump `AUDIT_RULES_VERSION` in
`scripts/audit-questions.ts`.

---

## Critical workflows

### Dev loop

```bash
npm run dev          # Next.js, port 3000 → falls back to 3001 if taken
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit + integration
npm run test:coverage # with gates (lines 80, funcs 90, branches 75, statements 80)
```

If port 3000 is in use, Next will quietly bind 3001. Pay attention to the
URL in the dev output.

### Adding more questions to the pool

```bash
caffeinate -i npm run seed:cache -- --target=100 2>&1 | tee seed.log
```

`caffeinate -i` keeps the Mac awake. The script:
- Rotates across all configured providers in `FREE_FIRST_ORDER`
- Benches dead providers (3 consecutive rate-limit errors → benched
  for the rest of the run)
- Verifies every question with `mathjs` before storing
- Idempotent — re-running fills only what's missing

### Audit + auto-fix the pool

```bash
npm run audit:fix
```

Runs: dedupe → audit → smart fixers → re-audit → mark audited.
**Incremental** — only processes rows where `last_audited_at IS NULL`.
After a clean pass, marks them. Next run only sees new questions
the seed-cache has added since.

If you change detector logic in `auditOne()`, bump `AUDIT_RULES_VERSION`
in `scripts/audit-questions.ts` (currently 2). Rows audited under an
older version get re-audited automatically.

### Ship-readiness check

```bash
npm run ship:check
```

Looks at salvageability targets in `audit.md`. ≥99% usable = good to go.

---

## Provider routing — the rationale

Two ordered chains in `src/lib/ai/router.ts`:

```ts
SPEED_FIRST_ORDER  (cold-cache, 1-question fast path):
  groq → cloudflare → mistral → gemini → cerebras → openrouter →
  claude → huggingface → deepseek → openai

FREE_FIRST_ORDER  (batch generation, used by seed-cache):
  cloudflare → groq → mistral → gemini → cerebras → openrouter →
  huggingface → claude → deepseek → openai
```

**Why mistral is at position 3, not 1**: Mistral has the most generous
free quota AND the highest observed quality (99.5% clean in our
14K-question seed run). But because it's so generous, putting it
first burns through other providers' tighter quotas (Cloudflare 10K
Neurons/day, Groq daily TPD) without using them. Order is designed to
exhaust smaller-quota providers FIRST, with Mistral as the reliable
workhorse fallback.

**Why cerebras is mid-chain, not at the front despite being fast**:
Cerebras (Llama 3.1 8B) consistently emits LaTeX commands like `\times`,
`\nu`, `\rho` with single backslashes inside JSON strings, causing
parse failures. We have a `fixLatexEscapes` repair pass in
`generator.ts` that handles most cases, but Cerebras still produces
~30% of the failed batches when used first.

**Override for a specific environment**:
```bash
AI_PROVIDER_ORDER=mistral,cloudflare,groq npm run dev
```
This pins the chain order regardless of the defaults.

---

## Known gotchas (DO NOT re-derive these — they took hours)

### `KEY_ENCRYPTION_SECRET` rotation kills BYOK

If you re-run `openssl rand -hex 32` and replace the secret in
`.env.local`, **every previously-saved BYOK key in `user_api_keys`
becomes undecryptable**. The user gets "Tried 0 of N providers"
errors that look like a routing bug but are really a key-resolver
silently returning empty.

Symptom: `[key-resolver] user=... byok=[] (0/8 decrypted)
decrypt-fails=[gemini,claude,...]` in dev server logs.

Fix: either restore the original secret OR
`delete from user_api_keys where user_id = '...'` and have the user
re-enter their keys via Settings → AI Providers.

### dotenv hoisting in scripts

ES module imports are hoisted, so `dotenv.config()` at the top of
`scripts/seed-cache.ts` runs AFTER the imports it's supposed to
support. We work around this with `scripts/_load-env.ts` — a
side-effect-only module that's imported FIRST in every script:

```ts
import './_load-env';  // ← MUST be the first import
import { createClient } from '@supabase/supabase-js';
```

If a script ignores process.env values that are set in `.env.local`,
check that `_load-env` is imported first.

### Empty-string env vars look like missing keys

`.env.local` often has placeholder lines like `OPENAI_API_KEY=` —
these load as empty strings, which pass `typeof === 'string'` but
fail real-key checks. The seed script's `_load-env.ts` prints
`provider keys present but EMPTY: [...]` warnings on startup so you
can spot this without grepping the file.

### LaTeX-in-JSON from AI providers

AI providers (especially Cerebras) emit LaTeX commands inside JSON
strings without escaping the backslashes:

```json
"prompt": "$3 \times 10^5$"   ← \t parses as TAB, breaks the JSON
```

The `fixLatexEscapes` function in `src/lib/ai/generator.ts` handles
this. Heuristic: if `\X` is followed by another letter, it's a
multi-letter LaTeX command (like `\times`, `\frac`, `\nu`, `\theta`)
even when X is normally a valid JSON escape character (`n`, `t`, `r`).
Don't simplify this function without considering all the cases — the
function has comments listing the patterns it handles.

### Bash path escaping for the project directory

The project path has a space: `~/Documents/Claude/Projects/Math Wizard/...`.
You must escape the space in shell commands:

```bash
cd ~/Documents/Claude/Projects/Math\ Wizard/math-wizard-pro
# Or quote:
cd "~/Documents/Claude/Projects/Math Wizard/math-wizard-pro"
```

Without escaping, zsh splits "Math Wizard/math-wizard-pro" into two
arguments and `cd` fails.

### Test coverage gates apply to a curated SCOPE

`vitest.config.ts` excludes UI components and route handlers from
coverage scope (they're tested via Playwright e2e). The 80/90/75/80
thresholds apply only to `lib/**` + 4 unit-tested components.

When adding a unit test for a previously-uncovered component, REMOVE
its line from the `exclude` list in `vitest.config.ts`. Otherwise the
new tests don't count toward coverage.

### `prompt_hash` UNIQUE doesn't catch semantic dupes

The schema has `unique(prompt_hash)` on `questions`, but two questions
that differ only in capitalization or whitespace have different hashes.
The `audit-questions.ts` dedupe pass uses a normalized hash (lowercased,
LaTeX-stripped, punctuation-stripped) to catch these. Run
`npm run audit:fix` after large seed runs to clean these up.

### Supabase REST API has a default 1000-row page limit

`supabase-js` `.limit(100_000)` is silently capped at 1000 unless you
paginate with `.range(start, end)`. The audit script paginates correctly;
new scripts that fetch from `questions` need to do the same. There's a
helper `fetchAllRows` in `scripts/audit-questions.ts` to copy from.

### Cold-path token budget tuning

For verbose-LaTeX skills (scientific notation, calculus, geometry
proofs), the AI's response can be 1500+ tokens per question. The
maxTokens budget in `src/lib/ai/generator.ts` is `Math.min(12000,
2000 + need * 1500)`. If you see `[generator] parse-truncated`
warnings in the dev logs, the budget might need another bump.

---

## Things to NEVER do without thinking carefully

- **Don't disable RLS on any table.** Every table denies by default and
  allows specific patterns explicitly. Disabling RLS leaks data across users.
- **Don't add `console.log(process.env.X)` or print API keys.** The
  `_load-env.ts` masking pattern (`maskValue`) is the safe way.
- **Don't bypass the verifier.** If a question goes into the cache
  with `verified: false` or skipping `verify()`, real users will get
  wrong answers. The whole architecture is built around the verifier
  being the trust boundary.
- **Don't change the verifier without re-auditing the pool.** Bump
  `AUDIT_RULES_VERSION` and run `npm run audit:fix:full`.
- **Don't put `$` followed by a digit in user-facing text** unless it's
  inside `$...$` math delimiters. KaTeX strips whitespace around `$`
  thinking it's math mode. Use `USD 12` or `12 dollars` for currency.
- **Don't commit `audit.md`, `audit.ids.csv`, `seed.log`** — these
  are gitignored as regenerable artifacts.
- **Don't downgrade Next.js below 16.** We use `next.after()` for
  background prefetch which is post-15 only.

---

## Production state as of v2.0.0 (May 2026)

- **Question pool:** 14,348 verified questions, 99.5% clean post-audit
- **Provider distribution:** Mistral 93%, Cloudflare 1%, Gemini 0.4%,
  Groq 0.7%, Cerebras 4.7%, others <1%. Mistral is doing the heavy
  lifting in batch generation.
- **Test coverage:** 152 tests passing, 92.3% line coverage on the
  in-scope libs and components, 100% function coverage.
- **Seeded skills:** 58 skills × 5 difficulties = 290 (skill, difficulty)
  pairs. Most pairs at 50+ questions; some 6-7 / 8-9 / 10-12 grade
  bands still being filled.

---

## When in doubt

- Run `npm run typecheck` and `npm test` after any non-trivial change.
- For UI changes: `npm run dev` and visually verify in the browser.
- For seed/audit changes: dry-run with `npm run audit:fix:dry` first.
- Read the inline comments. The non-obvious decisions are documented
  in the code.
- The `docs/` directory has deeper dives on architecture, security,
  setup, the seed cache pipeline, and pre-launch checklists.
- The user's name is Sandeep. He's running this for personal/family
  use, not a commercial app. Default to pragmatic decisions over
  hyperscale concerns.
