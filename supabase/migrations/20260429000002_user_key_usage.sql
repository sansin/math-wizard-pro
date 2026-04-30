-- ───────────────────────────────────────────────────────────────────────
-- Per-user-per-provider-per-day usage tracking for BYOK + admin keys.
-- Lets the BYOK settings UI show "Used today: 23 requests · 18,400 tokens"
-- under each key.
-- ───────────────────────────────────────────────────────────────────────

create table if not exists public.user_key_usage (
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  provider       text not null check (provider in (
    'gemini','claude','openai','deepseek','groq','cerebras',
    'cloudflare','openrouter','mistral','huggingface'
  )),
  source         text not null check (source in ('user','admin','validate')),
  usage_date     date not null,
  request_count  integer not null default 0,
  token_count    integer not null default 0,
  last_used_at   timestamptz not null default now(),
  primary key (user_id, provider, source, usage_date)
);

create index if not exists user_key_usage_user_idx on public.user_key_usage(user_id, provider, usage_date desc);

alter table public.user_key_usage enable row level security;

-- Users can read their own usage rows.
create policy user_key_usage_self_read on public.user_key_usage
  for select using (auth.uid() = user_id);

-- Writes are service-role only (no INSERT/UPDATE/DELETE policies for end users).

-- Optional: validation timestamp + last result per (user, provider).
-- Persisted so the "✓ Validated 2 min ago" hint survives a page refresh.
create table if not exists public.user_key_validation (
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  provider       text not null check (provider in (
    'gemini','claude','openai','deepseek','groq','cerebras',
    'cloudflare','openrouter','mistral','huggingface'
  )),
  ok             boolean not null,
  model          text,
  latency_ms     integer,
  error_message  text,
  validated_at   timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_key_validation enable row level security;

create policy user_key_validation_self_read on public.user_key_validation
  for select using (auth.uid() = user_id);

-- Writes are service-role only.
