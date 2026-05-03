# Math Wizard Pro

> Truly AI-powered adaptive math practice for K-12. Built as the v2 successor
> to [Math Wizard](https://github.com/sansin/math-wizard).

## What changed from v1

| Concern | v1 (Classic) | v2 (Pro) |
|---|---|---|
| AI keys | Bundled in the client (exposed) | Server-side only, BYOK with admin fallback |
| Question correctness | Regex re-derivation, often wrong | AI generates **and** server-side `mathjs` verifies before serving |
| AI providers | OpenAI only | 10-provider router: Gemini, Claude, OpenAI, DeepSeek, Groq, Cerebras, Cloudflare, OpenRouter, Mistral, HuggingFace |
| Hints | Random tip from a 3-string list | 3-tier progressive ladder, never reveals the answer |
| Solutions | None | Step-by-step worked solutions on every wrong answer |
| Math rendering | Plain Unicode | KaTeX (LaTeX) throughout |
| Database | Firebase (no rules committed) | Supabase Postgres + RLS, every table policy-locked |
| Adaptive engine | "70% lowest-accuracy operation" | Per-skill mastery (FSRS-lite) + spaced repetition |
| XP | 10 levels | 30 levels with extended ladder |
| Tests | 48 (mostly form rendering) | 150+ Vitest unit + integration + Playwright e2e, 92%+ coverage on math/mastery/auth |
| Build | CRA (unmaintained) | Next.js 16 App Router with Turbopack |
| Question quality | None | Verifier-backed pool + audit pipeline (dedupe, smart fixers, incremental gate) |
| Provider rotation | Single provider | Cross-batch health tracker, daily-quota benching, provider scoreboard |

## Stack

- **Frontend:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict + Tailwind + KaTeX + Recharts
- **Backend:** Next.js Route Handlers — runs on Vercel, Cloudflare Pages, or any Node host
- **Database:** Supabase Postgres with Row-Level Security on every table
- **Auth:** Supabase Auth (email/password)
- **AI:** 10-provider router with BYOK + admin keys + per-user shared-key quota, AES-256-GCM key encryption
- **Math engine:** mathjs for symbolic verification + answer canonicalization + equation equivalence
- **Tests:** Vitest 3 (unit + integration, 92%+ coverage), Playwright (e2e), CI on every PR
- **Tooling:** `tsx` for the seed/audit/upload scripts, `dotenv` for env loading

## Quick start

```bash
git clone https://github.com/sansin/math-wizard-pro.git
cd math-wizard-pro
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon (public) Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — keep this secret |
| `KEY_ENCRYPTION_SECRET` | 32 random bytes — generate with `openssl rand -hex 32` |
| At least one AI provider key | Any of `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_*`, `CEREBRAS_API_KEY`, etc. |
| `DISABLE_SHARED_KEYS` | `false` to let users use admin/env keys, `true` to force BYOK |
| `NEXT_PUBLIC_V1_URL` (optional) | URL of the v1 Classic app for the cross-link banner |

```bash
npm run dev
```

Open http://localhost:3000 (Next will fall back to 3001 if 3000 is taken).

## Database setup (Supabase, free tier)

1. Create a project at https://supabase.com (free, no card needed for under 500MB).
2. From Project Settings → API, copy the URL, anon key, and service role key into `.env.local`.
3. Run the migrations:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   Or paste the SQL files in `supabase/migrations/` into the Supabase SQL editor in order.

## AI providers — get free keys in 5 minutes

The app routes across up to 10 providers with automatic fallback,
per-batch health tracking, and daily-quota benching. None of the
following require a credit card.

**Recommended free tier (production-tested order):**

1. **Cloudflare Workers AI**: https://dash.cloudflare.com → AI / Workers AI → Create token. 10K Neurons/day free, very clean JSON output.
2. **Groq**: https://console.groq.com/keys — Llama 3.3 70B, fastest, large daily TPD.
3. **Mistral**: https://console.mistral.ai → API Keys — most generous free quota, highest observed quality (99.5% clean in our 14K-question seed).
4. **Gemini**: https://aistudio.google.com/apikey — 1500 RPD free.
5. **Cerebras**: https://cloud.cerebras.ai — fast inference; demoted in router order due to LaTeX-in-JSON quirks.
6. **OpenRouter, Mistral, HuggingFace** — additional fallbacks.

**Optional paid providers** (Claude, OpenAI, DeepSeek): only used when
the free tier is exhausted. Adding any one of these gives the router
a paid safety net; if you don't add them, the router gracefully fails
with a "wait and retry / add more providers" message.

Add them to `.env.local` as admin keys, **or** let users add their own via
**Settings → AI Providers** (BYOK). The router prefers user keys over admin
keys, then falls through the chain in order. You can override the order
per-environment with `AI_PROVIDER_ORDER=mistral,cloudflare,groq,...` in
`.env.local`.

## Building the question pool — seed → audit → ship

Math Wizard Pro generates questions on demand, but for a smooth first
experience we recommend pre-seeding a starter pool of ~5,000–30,000
verified questions. Run these three commands and the pool fills itself.

### 1. Generate questions (overnight on your Mac)

The seed script reuses the production generator + verifier pipeline,
so seeded questions are indistinguishable from live-traffic questions
in quality and shape. Idempotent — re-runs only fill what's missing.

```bash
# 100 questions per (skill, difficulty) — 290 pairs × 100 = ~29,000 total
caffeinate -i npm run seed:cache -- --target=100 2>&1 | tee seed.log

# Or smaller starter pool: 20 per pair = ~5,800 total (1-2 hours)
caffeinate -i npm run seed:cache -- --target=20 2>&1 | tee seed.log

# Or just one skill / difficulty / grade band:
caffeinate -i npm run seed:cache -- --skill=g23.add.regroup --target=50
caffeinate -i npm run seed:cache -- --gradeBand=K-1 --target=100
```

`caffeinate -i` keeps your Mac awake during the run. Safe to interrupt
with Ctrl+C and resume later — the script picks up exactly where it
left off.

The script automatically:
- Rotates across all configured providers (best free-tier order:
  `cloudflare → groq → mistral → gemini → cerebras → openrouter`)
- Benches providers that hit their daily quota until tomorrow
- Verifies every generated answer with `mathjs` before storing
- Logs progress per `(skill, difficulty)` pair

### 2. Audit + auto-fix the pool

After seeding, validate quality and apply automatic repairs:

```bash
# Default: dedupe → audit → auto-fix → re-audit → mark audited
npm run audit:fix
```

This runs the full ship-ready cycle:
1. **Dedupe** — finds near-duplicate questions (same skill + difficulty
   + normalized prompt) and keeps the best version
2. **Audit** — only processes rows that haven't been audited yet
   (incremental — fast on subsequent runs)
3. **Smart auto-fix**:
   - `prompt-bare-dollar-currency` → replaces `$12` with `USD 12`
   - `prompt-latex-break` → repairs unbalanced `$` delimiters
   - `hint-spoiler` → rewrites hints that leak the answer
   - `solution-no-answer` → appends a closing "Final answer" step
4. **Re-audit** — confirms the fixes stuck
5. **Mark audited** — so the next run skips already-clean rows

Other useful commands:

```bash
npm run audit:questions       # audit only, no writes (sample 5/pair)
npm run audit:questions:all   # audit only, every row, no writes
npm run audit:fix:dry         # preview what fix would do
npm run audit:fix:full        # force re-audit everything
```

The script outputs `audit.md` (full markdown report) and `audit.ids.csv`
(per-issue ID list for targeted SQL ops).

#### One-time migration (first run only)

The audit-state columns are added by a migration. Run it once via the
**Supabase SQL Editor → New query**:

```sql
alter table public.questions
  add column if not exists last_audited_at timestamptz,
  add column if not exists last_audit_version smallint;

create index if not exists questions_unaudited_idx
  on public.questions (verified)
  where last_audited_at is null;
```

If you skip this, the script falls back to full-audit-every-run mode
and prints the same SQL block to copy-paste. Apply when you're ready.

### 3. Ship-readiness check before launch

```bash
npm run ship:check   # runs audit:fix + prints a ✅ banner
```

Look at `audit.md`'s "Salvageability" section. Target:
- ✅ **Usable as-is**: ≥ 99%
- 🔁 **Must regenerate**: 0 (anything > 0 is `delete from questions where id in (...)` then re-seed)

Once the pool is at ship quality, open it up to real users. The report
button + `flagged_count >= 3` auto-demotion in `/api/questions/next`
will surface and retire any bad questions that slipped through.

### Repeatable loop after launch

When you generate more questions later, the same one-liner handles
everything — only newly-seeded rows get processed:

```bash
npm run seed:cache -- --target=100   # add more questions
npm run audit:fix                    # audit + fix only the new ones
```

The audit gate (`last_audited_at IS NULL` filter) means subsequent
runs are seconds, not minutes, even with a 30K-question pool.

## Test coverage

```bash
npm test                       # Vitest unit + integration (152 tests, ~2s)
npm run test:coverage          # with coverage gates enforced
npm run test:e2e               # Playwright e2e (separate flow)
npm run typecheck              # TypeScript strict, no implicit any, noUncheckedIndexedAccess
```

Coverage gates in `vitest.config.ts` apply to the libraries and the
unit-tested components — UI components and route handlers are covered
by Playwright e2e and excluded from the gate scope. Current numbers
on the in-scope files:

| Area | Lines | Functions |
|---|---:|---:|
| `lib/utils` | 100% | 100% |
| `lib/mastery/{engine,xp}` | 95% | 100% |
| `lib/math/{parser,checker,verifier,equivalence}` | 92% | 100% |
| `lib/ai/{router,encryption}` | 94% | 100% |
| `components/{ui/Button, math/*, practice/HintLadder}` | 92% | 100% |
| **Aggregate (in-scope)** | **92.3%** | **100%** |

Thresholds: lines ≥ 80, statements ≥ 80, branches ≥ 75, functions ≥ 90.

To bring a UI component into coverage gating, remove its line from the
`exclude` list in `vitest.config.ts` and add a unit test for it.

## Deploy to Cloudflare Pages (free)

1. Push the repo to GitHub.
2. Cloudflare dashboard → Pages → Create project → Connect to Git.
3. Framework preset: **Next.js**, Build command: `npm run build`, Output: `.next`.
4. Add environment variables (same as `.env.example`).
5. First deploy.

Custom domain is free. Bandwidth is unlimited. No request count concerns at this scale.

## v1 ↔ v2 toggle

`scripts/v1-toggle-patch.md` has a tiny diff to add a "🚀 Try Pro" button to the
existing v1 app. v2 already has a "← Classic" link in its nav whenever
`NEXT_PUBLIC_V1_URL` is set. Users see what looks like a toggle without us
maintaining a feature flag in code.

## Migration from v1

`/migrate` flow:
1. User enters their Classic email + password.
2. We verify the credentials directly with Firebase (no Firebase SDK in the
   bundle — minimal REST helpers in `src/lib/firebase/legacy.ts`).
3. We fetch their profile + answer count, show a preview.
4. They set a v2 password.
5. We create a Supabase user with the same email, copy XP and metadata.
6. They sign in to v2 going forward; v1 still works untouched.

## Architecture overview

```
┌─ src/
│  ├─ app/                       Next.js App Router pages + route handlers
│  │  ├─ api/                    Route handlers
│  │  │  ├─ questions/next       Cache-first generator with health-tracked router
│  │  │  ├─ questions/report     Flag-a-question endpoint (used by ReportButton)
│  │  │  ├─ attempts/            Submit + scoring + mastery update
│  │  │  ├─ skills/              Skill catalog with mastery overlay
│  │  │  ├─ keys/                BYOK CRUD (encrypted at rest)
│  │  │  ├─ sessions/            Practice/test session lifecycle
│  │  │  └─ parent/              Weekly parent digest
│  │  ├─ practice/               Student practice flow
│  │  ├─ dashboard/              Student progress
│  │  ├─ parent/                 Parent view
│  │  ├─ settings/               Profile + AI provider keys
│  │  ├─ migrate/                v1 → v2 import flow
│  │  └─ login/                  Auth
│  ├─ components/
│  │  ├─ ui/                     Button, Card, Input, Modal
│  │  ├─ math/                   MathRender (KaTeX), AnswerInput
│  │  ├─ practice/               ModuleSelector, PracticeScreen, HintLadder,
│  │  │                          SolutionPanel, ProviderBadge, ReportButton,
│  │  │                          SessionEndSummary
│  │  ├─ layout/                 AppShell, KeyReminder
│  │  ├─ dashboard/              StudentDashboard
│  │  ├─ parent/                 ParentDashboard
│  │  ├─ settings/               ProviderSettings, ProfileSettings
│  │  └─ Wizard.tsx              SVG mascot
│  ├─ lib/
│  │  ├─ ai/                     Multi-provider router + 10 providers + BYOK encryption
│  │  │                          + key resolver + usage tracking
│  │  ├─ math/                   Parser, checker, verifier, equivalence (mathjs)
│  │  ├─ mastery/                Adaptive engine + XP/levels
│  │  ├─ supabase/               Server + browser clients
│  │  └─ firebase/               Legacy v1 helpers (migration only)
│  └─ types/                     Domain types
├─ supabase/
│  └─ migrations/                SQL — schema, RLS, triggers, seed, audit-state
├─ tests/
│  ├─ unit/                      Vitest — parser, checker, verifier,
│  │                             equivalence, XP, mastery, router, encryption,
│  │                             4 components (Button/AnswerInput/MathRender/HintLadder)
│  ├─ integration/               Multi-piece flows (attempts API, etc.)
│  └─ e2e/                       Playwright — landing, auth, a11y
├─ scripts/
│  ├─ seed-cache.ts              Bulk-populate question pool via prod pipeline
│  ├─ audit-questions.ts         Dedupe + audit + smart fixers + re-audit
│  ├─ upload-curated-questions.ts  Hand-curated JSON → DB (uses prod verifier)
│  ├─ quality-spot-check.sql     Morning audit queries for the SQL editor
│  ├─ _load-env.ts               .env.local loader (imported first)
│  └─ v1-toggle-patch.md         Tiny patch for v1 to add the "Try Pro" button
├─ data/
│  └─ seed/curated/              Hand-curated question batches (JSON)
└─ docs/
   ├─ ARCHITECTURE.md            System design
   ├─ SECURITY.md                Threat model + key handling
   ├─ SETUP.md                   Step-by-step deploy
   ├─ SEED_CACHE.md              Seed pipeline runbook
   └─ GO_LIVE.md                 Pre-launch checklist
```

## How a question gets to the user

```
[student clicks Practice]
       │
       ▼
POST /api/questions/next
       │
       ├─ adaptiveEngine.pickNext(skills, mastery)  →  (skill, difficulty)
       │
       ├─ Cache lookup (3 tiers):
       │    1. Exact match: skill + difficulty + not-seen-by-this-user
       │    2. Adjacent difficulty (±1) if exact tier is empty
       │    3. Quality-weighted ranking: prefers low flagged_count + high correctness
       │           found → return immediately ✓ (sub-second)
       │
       └─ Cache miss → resolveKeysForUser(userId)
                          ├─ user BYOK keys (preferred, decrypted just in time)
                          └─ admin keys from env (if user not opted out + within quota)
                       → router.route(prompt, ctx)
                          • Fallback chain across up to 10 providers
                          • Cross-batch health tracker benches dead providers
                          • SPEED_FIRST_ORDER for cold-cache, FREE_FIRST_ORDER for batch
                       → generator.generateBatch(N=5)
                          • Token budget tuned for verbose-LaTeX skills (12K cap)
                          • LaTeX-in-JSON escape repair (handles \times, \nu, etc.)
                          • Retry skips providers that produced unparseable JSON
                          for each draft:
                             ├─ verify(prompt, claimedAnswer) via mathjs
                             ├─ reject if mismatch → regenerate up to MAX_RETRIES
                             └─ accept → cache row, return first to user

       │
       ▼
After delivery (next.after()):
       • Background prefetch of next question for this skill/difficulty
       • Multi-difficulty warm-up (D-1, D, D+1) so adjacent tiers stay warm
```

Result: every question shipped to the student has a verified answer. The
"answer is 0 when it's actually 6x" class of v1 bug is impossible.

## Quality control — the audit pipeline

Verified-at-generation is the foundation; the audit pipeline is the
ongoing quality bar. It's how we keep the pool at 99.5%+ clean as the
seed runs add tens of thousands of questions.

`npm run audit:fix` runs the full cycle:

1. **Dedupe** — normalized-prompt hash (LaTeX-stripped, lowercased,
   punctuation-stripped) finds near-duplicates the existing
   `prompt_hash UNIQUE` index misses. Keeps the best version
   (highest served_count → lowest flagged_count → oldest).
2. **Schema audit** — every question re-validated against the same
   zod schemas the live router uses.
3. **Production verifier re-run** — re-checks every stored numeric
   answer against the prompt's arithmetic, every fraction's parse,
   every expression's mathjs canonicalization.
4. **Quality checks** — hint-spoiler detection, solution-no-answer
   check, broken-LaTeX detection.
5. **Smart auto-fixers**:
   - `prompt-bare-dollar-currency` → strips bare `$N` outside LaTeX, replaces with USD
   - `prompt-latex-break` → multi-pattern repair (trailing `$$`, stray inner `$`, bare-currency sequences)
   - `hint-spoiler` → rewrites "Count: A, B, C..." templates that leak the answer
   - `solution-no-answer` → appends a "Final answer" closing step
6. **Re-audit** — confirms patches stuck.
7. **Mark audited** — incremental gate so subsequent runs only
   process newly-seeded rows.

In production we took a 14,348-question pool from 71% clean to **99.5%
clean** with a single `npm run audit:fix` and zero API calls (all fixes
are deterministic).

Real users surface the long-tail issues via the **🚩 Report this question**
button. Once a question's `flagged_count >= 3`, it's auto-demoted in the
cache lookup so other students stop seeing it.

## Privacy & safety

- **BYOK encryption:** user-supplied API keys are encrypted with
  AES-256-GCM (Web Crypto API) before storage in Postgres. The
  encryption secret (`KEY_ENCRYPTION_SECRET`, 32 random bytes) lives
  only in the server's environment — never in the database, never in
  the browser bundle.
- **No service-role key in the client:** the Supabase service role key
  is held server-side only and is used by route handlers. The browser
  receives the anon key, which is gated by RLS.
- **Postgres RLS by default:** every table denies all access, then
  allows owners (and admins, where applicable) explicitly. See
  `supabase/migrations/20260428000002_rls_policies.sql`.
- **Minimal PII:** account email is the only personal data stored.
  No location, no tracking pixels, no third-party analytics.
- **Report-driven retirement:** users can flag bad questions. Three
  flags retire the question from the lookup pool — no manual review
  bottleneck.

For the full threat model and key-handling notes, see
[`docs/SECURITY.md`](docs/SECURITY.md).

## Roadmap (post-launch)

These were intentionally cut from v2.0 to keep scope tight; tracked in issues:

- Voice tutor (Realtime API)
- Teacher / classroom layer
- K-2 picture-only mode (drag-to-answer, voice narration)
- Multiplayer challenges (port from v1)
- Spaced repetition based on FSRS proper
- Push notifications for streak reminders
- Internationalization

## License

MIT © 2026
