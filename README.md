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
| Tests | 48 (mostly form rendering) | Vitest unit + integration + Playwright e2e, real coverage on math engine |
| Build | CRA (unmaintained) | Next.js 14 App Router |

## Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind + KaTeX + Recharts
- **Backend:** Next.js Route Handlers (Edge-compatible) — runs on Cloudflare Pages, Vercel, Netlify, anywhere
- **Database:** Supabase Postgres with Row-Level Security
- **Auth:** Supabase Auth (email/password + magic link ready)
- **AI:** 10-provider router with BYOK + admin keys + per-user shared-key quota
- **Tests:** Vitest (unit + integration), Playwright (e2e), CI on every PR

## Quick start

```bash
git clone https://github.com/sansin/math-wizard-pro.git
cd math-wizard-pro
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, anon key, service-role key,
# KEY_ENCRYPTION_SECRET (run: openssl rand -hex 32),
# and at least one AI provider key.
npm run dev
```

Open http://localhost:3000.

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

1. **Gemini** (recommended primary): https://aistudio.google.com/apikey — 1500 free req/day.
2. **Groq**: https://console.groq.com/keys — free tier, very fast.
3. **Cerebras**: https://cloud.cerebras.ai — free tier, fastest inference.
4. (Optional, paid) Claude, OpenAI, DeepSeek for fallback / quality boost.

Add them to `.env.local` as admin keys, **or** let users add their own via
Settings → AI Providers (BYOK). The router prefers user keys over admin keys.

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
│  ├─ app/                    Next.js App Router pages + route handlers
│  │  ├─ api/                 Route handlers (questions, attempts, keys, etc.)
│  │  ├─ practice/            Student practice flow
│  │  ├─ dashboard/           Student progress
│  │  ├─ parent/              Parent view
│  │  ├─ settings/            Profile + AI provider keys
│  │  ├─ migrate/             v1 → v2 import flow
│  │  └─ login/               Auth
│  ├─ components/
│  │  ├─ ui/                  Button, Card, Input, Modal
│  │  ├─ math/                MathRender (KaTeX), AnswerInput
│  │  ├─ practice/            ModuleSelector, PracticeScreen, HintLadder, SolutionPanel
│  │  ├─ dashboard/           StudentDashboard
│  │  ├─ parent/              ParentDashboard
│  │  ├─ settings/            ProviderSettings, ProfileSettings
│  │  └─ Wizard.tsx           SVG mascot
│  ├─ lib/
│  │  ├─ ai/                  Multi-provider router + 6 providers + BYOK encryption
│  │  ├─ math/                Parser, checker, verifier (mathjs)
│  │  ├─ mastery/             Adaptive engine (skill picking + difficulty), XP
│  │  ├─ supabase/            Server + browser clients
│  │  └─ firebase/            Legacy v1 helpers (migration only)
│  └─ types/                  Domain types
├─ supabase/
│  └─ migrations/             SQL — schema, RLS, triggers, seed
├─ tests/
│  ├─ unit/                   Vitest — parser, checker, verifier, XP, router, components
│  ├─ integration/            Multi-piece flows
│  └─ e2e/                    Playwright — landing, auth, a11y
└─ scripts/
   └─ v1-toggle-patch.md      Tiny patch for v1 to add the "Try Pro" button
```

## How a question gets to the user

```
[student clicks Practice]
       │
       ▼
GET /api/questions/next
       │
       ├─ adaptiveEngine.pickNext(skills, mastery)  →  (skill, difficulty)
       │
       ├─ try cache: questions WHERE skill_id, difficulty, !seen
       │       └─ found → return immediately ✓
       │
       └─ cache miss → resolveKeysForUser(userId)
                          ├─ user BYOK keys (preferred)
                          └─ admin keys (if not blocked + within quota)
                       → router.route(prompt, ctx)
                          fallback chain over up to 6 providers
                       → generator.generateBatch(N=5)
                          for each draft:
                             ├─ verify(prompt, claimedAnswer) via mathjs
                             ├─ reject if mismatch (regenerate up to MAX_RETRIES)
                             └─ accept → cache row, return first to user
```

Result: every question shipped to the student has a verified answer. The
"answer is 0 when it's actually 6x" class of v1 bug is impossible.

## Privacy & safety

- API keys (BYOK) encrypted with AES-256-GCM before storage.
- Service role key never reaches the browser bundle.
- Firestore RLS by default — every table denies, then allows owners explicitly.
- Children's email addresses are the only PII stored. No location, no tracking,
  no third-party analytics.

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
