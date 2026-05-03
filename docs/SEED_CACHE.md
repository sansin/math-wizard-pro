# Cache Seeding Runbook

How to bulk-populate the `questions` table so brand-new users (with no API keys
of their own) can still get instant practice. The seed script reuses the
production generator + verifier pipeline, so seeded questions are
indistinguishable from live-traffic questions in quality and shape.

---

## TL;DR

```bash
# top up every (skill, difficulty) to 100 questions — one-shot starter pool
npx tsx scripts/seed-cache.ts --target=100

# re-runnable: skips pairs already at/above target
npx tsx scripts/seed-cache.ts --target=100
```

Idempotent. Safe to interrupt and resume. Saves provider attribution per
question.

---

## When to run this

- **Day-1 launch**: build a starter pool so signed-up users without keys still
  get a smooth ride.
- **After adding new skills**: top up the new (skill, difficulty) pairs.
- **After mass deletes**: e.g. you bulk-flagged a provider's output and want
  to rebuild.
- **Weekly cron**: optional — keep the floor at 100 even as users churn
  through low-quality items.

---

## Quick start

### 1. Configure provider keys

The script reads from `.env.local`. The same env vars Vercel uses. You need
at least one of:

```bash
# Highest free quotas first
GEMINI_API_KEY=...           # 1500 RPD free tier
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...     # 10K Neurons/day free
GROQ_API_KEY=...             # generous free tier
CEREBRAS_API_KEY=...         # generous free tier
ANTHROPIC_API_KEY=...        # paid
OPENAI_API_KEY=...           # paid
DEEPSEEK_API_KEY=...
OPENROUTER_API_KEY=...
MISTRAL_API_KEY=...
HUGGINGFACE_API_KEY=...
```

Plus the Supabase service-role:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=... # NEVER commit this
```

### 2. Dry-run first

```bash
npm run seed:cache:dry
```

This prints the full work plan (which (skill, difficulty) pairs need topping
up, and how many questions per pair) without making any AI calls or DB
writes. Use this to estimate cost/time.

### 3. Run

```bash
npm run seed:cache              # default --target=20
npx tsx scripts/seed-cache.ts --target=100
```

The script logs progress per (skill, difficulty) pair and gracefully backs
off on rate-limit errors.

---

## CLI reference

| Flag | Default | Meaning |
|---|---|---|
| `--target=N` | 20 | Aim for N verified questions per (skill, difficulty) |
| `--skill=ID` | — | Only seed one skill (e.g. `g23.add.regroup`) |
| `--difficulty=N` | — | Only seed one difficulty (1–5) |
| `--gradeBand=B` | — | Only seed one band (`K-1`, `2-3`, `4-5`, `6-8`, `9-12`) |
| `--batchSize=N` | 5 | Questions per AI call (smaller = better verification odds) |
| `--parallelism=N` | 1 | Number of concurrent AI calls |
| `--dryRun` | false | Print plan, don't generate |

### Common patterns

```bash
# Top up just one grade band
npx tsx scripts/seed-cache.ts --target=100 --gradeBand=2-3

# Aggressively rebuild a single skill at every difficulty
npx tsx scripts/seed-cache.ts --target=100 --skill=g23.add.regroup

# Repair: only difficulty 5 was thin after a flag-storm
npx tsx scripts/seed-cache.ts --target=100 --difficulty=5
```

---

## What "100 per (skill, difficulty)" looks like

We have 58 skills × 5 difficulty levels = **290 (skill, difficulty) pairs**.

| Target per pair | Total questions | AI calls @ batchSize=5 |
|---|---|---|
| 20 (default) | 5,800 | ~1,160 |
| 50 | 14,500 | ~2,900 |
| **100 (recommended starter pool)** | **29,000** | **~5,800** |

### Time + cost estimates for 100 per pair (29,000 questions)

| Provider mix | Wall time | Cost |
|---|---|---|
| Gemini free tier only (1500 RPD) | ~4 days | $0 |
| Cloudflare Workers AI free | ~1–2 days | $0 |
| **Gemini + Cloudflare + Groq + Cerebras (recommended)** | **~6–10 hours** | **$0** |
| All 4 free + paid Claude/OpenAI fallback | ~3–5 hours | ~$2–5 |
| Paid only (Claude Sonnet) | ~2 hours | ~$15–25 |

> The router walks the `SPEED_FIRST_ORDER` chain and falls back automatically
> when one provider rate-limits. So the more keys you set, the faster (and
> more diverse) the pool.

### Recommended approach for a clean Day-1 launch

```bash
# 1. Set up the four free heavy-hitters in .env.local:
#    GEMINI_API_KEY, CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN,
#    GROQ_API_KEY, CEREBRAS_API_KEY

# 2. Dry-run to confirm coverage
npm run seed:cache:dry -- --target=100

# 3. Run overnight
npx tsx scripts/seed-cache.ts --target=100 2>&1 | tee seed.log
```

---

## How the script works (architecture)

```
seed-cache.ts
├── parseArgs()              — CLI flags
├── buildAdminContext()      — collect provider keys from env
├── load skills              — from public.skills (filtered by --skill / --gradeBand)
├── for each (skill, difficulty):
│   ├── count existing verified questions
│   ├── if existing >= target → skip
│   ├── pull recent prompt_hash list (avoid duplicates)
│   └── while need > 0 and attempts < maxAttempts:
│       ├── generateBatch({ skill, difficulty, count, avoidPromptHashes })
│       │   └── routes through provider chain, verifies, returns Q[]
│       ├── upsert into public.questions
│       │   └── ON CONFLICT (prompt_hash) DO NOTHING
│       └── log progress
└── exit
```

### Provider attribution

Every row in `public.questions` carries:

- `provider` — which AI engine produced it (e.g. `gemini`, `cerebras`,
  `cloudflare`)
- `source` — `'admin'` for seeded questions (since the script uses admin
  keys from env)

The `ProviderBadge` UI component reads these and shows the user e.g.
"Generated by Google Gemini · cached" when the cache hits.

You can tag a curated subset by directly inserting with `source = 'curated'`
— the badge then shows "📚 Curated bank" instead of the model name.

---

## Operational tips

### Rate-limit handling

The script auto-backs-off 30 seconds on `rate`/`quota` errors. If a single
provider's quota is exhausted for the day, the router skips it for the
remainder of the run.

To force a specific provider, set only that key:

```bash
GEMINI_API_KEY=... npx tsx scripts/seed-cache.ts --target=100
```

### Checking progress mid-run

In another terminal:

```sql
-- per-pair fill levels
select skill_id, difficulty, count(*)
from questions
where verified = true
group by 1, 2
order by 1, 2;

-- pairs still under 100
select skill_id, difficulty, count(*)
from questions
where verified = true
group by 1, 2
having count(*) < 100
order by count(*) asc;
```

### Diversity check — provider distribution

```sql
select provider, count(*)
from questions
where verified = true
group by 1 order by 2 desc;
```

A healthy pool spreads across 3+ providers so no single outage cripples
delivery.

### Quality monitoring

Once users start playing, the `flagged_count` and correctness-rate
ranking in `/api/questions/next` will demote bad seeds automatically.
After a week of live traffic, re-run with `--target=100` to top up the
gaps left by demotions.

---

## Pre-deployment checklist

Before launching to real users:

- [ ] Run `npm run seed:cache:dry -- --target=100` — confirm plan is sane
- [ ] Run `npm run seed:cache -- --target=100` — wait for completion
- [ ] Verify counts: `select count(*) from questions where verified = true;`
      — should be ≥ 28,000 (some pairs may fall short on hard skills)
- [ ] Verify diversity: at least 3 distinct values in `provider` column
- [ ] Spot-check 10 random rows manually for correctness
- [ ] Run smoke test: create a test account with NO BYOK keys and verify
      they can practice all 58 skills without hitting "no-providers"

---

## FAQ

**Q: Will this run cost me money?**
With Gemini + Cloudflare + Groq + Cerebras (all free, no card), expect
$0. Paid providers (Claude, OpenAI) are only used if you set their keys.

**Q: Can I run this on Vercel?**
No — it needs `service_role` and runs for hours. Run locally or on a
small cloud VM.

**Q: What if I want to start over from scratch?**
```sql
delete from questions where source = 'admin';
```
Then re-run the seeder. (Don't delete `source = 'user'` — those are
contributions from real users' BYOK generations.)

**Q: The seeder says "0/X added" for some pair — why?**
Either every batch was rejected by verification (likely a hard skill +
high difficulty combo), or all providers rate-limited simultaneously.
Re-run later; the script is idempotent.

**Q: Can I use this to grow a single skill to 1000+ questions?**
Yes. `npx tsx scripts/seed-cache.ts --skill=g23.add.regroup --target=1000`
— but be prepared for hours and possible quota burn.
