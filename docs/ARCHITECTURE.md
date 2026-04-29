# Architecture

This doc explains the why behind the major design choices. For setup, see
SETUP.md. For provider-specific BYOK instructions, see PROVIDERS.md.

## Goals

1. **Trustworthy math.** Every question shipped to a student has a
   server-verified answer. The "is the AI right?" failure mode of v1 is
   structurally impossible.
2. **Truly AI-powered.** Questions are generated dynamically by frontier
   LLMs. We aggressively bulk + cache so cost stays near $0.
3. **Cloud-agnostic.** The frontend is a static Next.js app; the backend is
   route handlers that work on Cloudflare Pages, Vercel, Netlify, Supabase
   Edge Functions, or any Node host.
4. **Cheap to run.** Built around free tiers: Cloudflare Pages, Supabase free
   Postgres, Gemini's 1500/day free.
5. **Privacy-respecting.** No analytics, no third-party trackers, encrypted
   user-supplied API keys, RLS by default.

## Data flow — practice loop

```
Browser ─── POST /api/sessions ───▶ Supabase
   │                                    │
   ◀──────── { sessionId } ─────────────┘
   │
   ├── POST /api/questions/next ─▶ adaptive engine + cache + AI router
   │                                    │
   ◀──────── { question, reason } ──────┘
   │
   │  (student answers + clicks Submit)
   │
   ├── POST /api/attempts ────────▶ Supabase
   │       └─ trigger updates skill_mastery + xp_state + question stats
   │
   ◀──────── { correct, xpEarned, expected } ─────┘
   │
   └── (loop)
```

## AI router — fallback strategy

```
                 ┌── user keys (BYOK)  in preferred order
                 │      ├─ gemini       ── if 429 ──┐
                 │      ├─ groq         ── if 429 ──┤
                 │      └─ ...          ── if 429 ──┤
                 │                                  │
prompt ──▶ route ┤                                  ├──▶ first success returns
                 │                                  │
                 └── admin keys (if allowed)        │
                        ├─ gemini       ── if 429 ──┤
                        ├─ groq         ── if 429 ──┤
                        └─ ...          ── if 429 ──┘
                                                    │
                                                    ▼
                                       NoProviderError
```

- Auth errors (401/403) skip the bad key but don't poison the user's other
  providers.
- Rate-limit errors (429) are retryable — we try the next provider.
- Server errors (5xx) are retryable; we try the next provider.
- Bad-request errors (400) are non-retryable; we fall through.

## Question lifecycle

```
                    cache hit ──────────▶ serve to user
                        ▲
                        │
                ┌─ check by (skill, difficulty, !seen)
                │
                │  cache miss
                │       │
                │       ▼
                │   batch generate (5 questions, single API call)
                │       │
                │       ▼
                │   for each draft:
                │       ├─ verify(prompt, claimedAnswer)
                │       │     ├─ ok      → keep
                │       │     └─ reject  → drop
                │       └─ store in `questions` table
                │
                └──── persist & return
```

This is how we get away with calling the AI rarely. The first user on a
(skill, difficulty) pair pays the API cost; everyone else hits the cache.

## Mastery + XP

The Postgres trigger `handle_attempt_insert` is the single source of truth
for both mastery state and XP. The TypeScript helper
`src/lib/mastery/xp.ts` mirrors the formula for optimistic UI updates only.

Mastery update rule (per skill):
```
weight = 1 / (1 + attempts * 0.10)        # newer evidence heavier when sparse
target = correct ? 1 : 0
mastery' = clamp(0..1, mastery + (target - mastery) * weight)
```

Spaced repetition: due_at is set as a function of mastery (1h / 1d / 3d / 7d).
The adaptive engine prefers due skills.

XP formula:
```
correct  = base 10
         + difficulty bonus (0/3/6/10/15)
         + min(streak * 2, 20)
         − hint penalty (0/2/4/6)
         (floor 1)
incorrect = 0
```

## Security model

| Surface | Defense |
|---|---|
| Browser bundle | Never contains a raw provider API key. `REACT_APP_*` patterns avoided. |
| BYOK at rest | AES-256-GCM with random IV. Encryption secret in env, decryption only in route handlers. |
| Database tables | RLS enabled on every public.* table. Owners + linked parents only. |
| Service role key | Used exclusively in route handlers. Never imported into client components. |
| Rate limiting | Per-user-per-day shared-key quota in `shared_key_usage`. |
| User answer | Server-side parsed + checked against verified answer. No client-side correctness logic. |
| RLS bypass | Only via `getServiceClient()`, which is server-only. |

## Why these libraries

- **Next.js 14 (App Router)** — RSC + route handlers in one framework.
  Hostable on Cloudflare/Vercel/Netlify. No CRA legacy.
- **Supabase** — Postgres > Firestore for analytics workloads. RLS is a real
  primitive, not bolted-on rules. Vector column comes free for cache dedup.
- **mathjs** — well-tested symbolic engine. Used only server-side.
- **KaTeX** — fast, no JS-heavy MathJax dependency, beautiful output.
- **Recharts** — works on the server, accessible by default, simple API.
- **Vitest** — Vite-fast, TS-native, modern.
- **Zod** — runtime validation at the API boundary.

## What's not here (yet)

- Voice tutor (Realtime API) — planned for v2.1
- Teacher/classroom mode — planned for v2.2
- K-2 picture-only mode — planned for v2.1
- Multiplayer challenges — port from v1 in v2.2
- pgvector dedup is in the schema but the embedding pipeline is TODO
