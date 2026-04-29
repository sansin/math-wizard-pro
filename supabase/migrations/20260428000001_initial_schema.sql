-- ───────────────────────────────────────────────────────────────────────
-- Math Wizard Pro — Initial schema
--
-- Postgres 15+ on Supabase. All tables enable Row Level Security; the
-- policies live in 20260428000002_rls_policies.sql so this file is
-- focused on shape.
-- ───────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ───────────────────────────────────────────────────────────────────────
-- Profiles — supplements auth.users with app-specific fields.
-- Identified by user_id == auth.uid(). One row per Supabase user.
-- ───────────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text not null,
  age               smallint check (age between 3 and 99),
  grade_band        text not null check (grade_band in ('K-1','2-3','4-5','6-7','8-9','10-12')),
  role              text not null default 'student' check (role in ('student','parent','admin')),
  preferences       jsonb not null default '{}'::jsonb,
  daily_goal        smallint not null default 10,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Used by the v1 → v2 migration flow.
  legacy_firebase_uid text unique
);

create index profiles_grade_band_idx on public.profiles(grade_band);
create index profiles_role_idx on public.profiles(role);

-- ───────────────────────────────────────────────────────────────────────
-- Skill catalog — read-only reference data. Populated by seed migration.
-- ───────────────────────────────────────────────────────────────────────
create table public.skills (
  id                  text primary key,
  name                text not null,
  module              text not null,
  topic               text not null,
  grade_band          text not null check (grade_band in ('K-1','2-3','4-5','6-7','8-9','10-12')),
  intrinsic_difficulty smallint not null check (intrinsic_difficulty between 1 and 5),
  prerequisites       text[] not null default '{}',
  standards           text[] not null default '{}',
  created_at          timestamptz not null default now()
);

create index skills_grade_band_idx on public.skills(grade_band);
create index skills_module_idx on public.skills(module);

-- ───────────────────────────────────────────────────────────────────────
-- Question cache — every verified AI-generated question lives here.
-- Reused across users to amortize generation cost. Embedding column is
-- used to dedupe semantically-similar questions.
-- ───────────────────────────────────────────────────────────────────────
create table public.questions (
  id              uuid primary key default uuid_generate_v4(),
  prompt_hash     text not null,
  skill_id        text not null references public.skills(id),
  difficulty      smallint not null check (difficulty between 1 and 5),
  prompt          text not null,
  answer          jsonb not null,         -- AnswerKind discriminated union
  hints           jsonb not null,         -- [Hint, Hint, Hint]
  solution        jsonb not null,         -- SolutionStep[]
  source          text not null check (source in ('ai','curated','template')),
  provider        text,                   -- AIProviderId or null
  verified        boolean not null default false,
  served_count    integer not null default 0,
  correct_count   integer not null default 0,
  flagged_count   integer not null default 0,
  embedding       vector(384),            -- optional, for semantic dedup
  created_at      timestamptz not null default now()
);

create index questions_skill_difficulty_idx on public.questions(skill_id, difficulty);
create unique index questions_prompt_hash_uniq on public.questions(prompt_hash);
create index questions_source_idx on public.questions(source);
-- Vector index for similarity search (HNSW, cosine distance).
-- Created CONCURRENTLY in production; here we issue plain create for migrations.
create index questions_embedding_idx on public.questions
  using hnsw (embedding vector_cosine_ops);

-- ───────────────────────────────────────────────────────────────────────
-- Practice sessions
-- ───────────────────────────────────────────────────────────────────────
create table public.sessions (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles(user_id) on delete cascade,
  mode              text not null check (mode in ('practice','test','review','challenge')),
  grade_band        text not null,
  skill_ids         text[] not null,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  question_count    integer not null default 0,
  correct_count     integer not null default 0,
  xp_earned         integer not null default 0
);

create index sessions_user_started_idx on public.sessions(user_id, started_at desc);

-- ───────────────────────────────────────────────────────────────────────
-- Attempts — append-only. One row per question answered.
-- ───────────────────────────────────────────────────────────────────────
create table public.attempts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(user_id) on delete cascade,
  session_id      uuid references public.sessions(id) on delete set null,
  question_id     uuid not null references public.questions(id),
  skill_id        text not null references public.skills(id),
  difficulty      smallint not null check (difficulty between 1 and 5),
  submitted       text not null,
  parsed          jsonb,
  correct         boolean not null,
  hints_used      smallint not null default 0,
  time_ms         integer not null check (time_ms >= 0),
  attempted_at    timestamptz not null default now()
);

create index attempts_user_attempted_idx on public.attempts(user_id, attempted_at desc);
create index attempts_skill_idx on public.attempts(skill_id);

-- ───────────────────────────────────────────────────────────────────────
-- Per-skill mastery — single row per (user, skill).
-- Updated by a trigger after each attempt.
-- ───────────────────────────────────────────────────────────────────────
create table public.skill_mastery (
  user_id                 uuid not null references public.profiles(user_id) on delete cascade,
  skill_id                text not null references public.skills(id),
  mastery                 numeric(4,3) not null default 0.000,    -- 0..1
  confidence              numeric(4,3) not null default 0.000,
  attempts                integer not null default 0,
  correct_streak          integer not null default 0,
  last_attempt_at         timestamptz,
  due_at                  timestamptz,
  avg_correct_difficulty  numeric(3,2) not null default 0.00,
  primary key (user_id, skill_id)
);

create index skill_mastery_due_idx on public.skill_mastery(user_id, due_at);

-- ───────────────────────────────────────────────────────────────────────
-- XP state — denormalized snapshot per user. Computed from attempts.
-- ───────────────────────────────────────────────────────────────────────
create table public.xp_state (
  user_id          uuid primary key references public.profiles(user_id) on delete cascade,
  total_xp         integer not null default 0,
  level            smallint not null default 1,
  daily_answered   integer not null default 0,
  last_active_date date,
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  weekly_answered  integer not null default 0,
  updated_at       timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────
-- BYOK — encrypted user-supplied API keys.
-- The encrypted_key column stores AES-256-GCM ciphertext (server-only).
-- ───────────────────────────────────────────────────────────────────────
create table public.user_api_keys (
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  provider       text not null check (provider in ('gemini','claude','openai','deepseek','groq','cerebras')),
  encrypted_key  text not null,             -- ciphertext; server-only access
  hint           text not null,             -- last 4 chars for display
  active         boolean not null default true,
  added_at       timestamptz not null default now(),
  primary key (user_id, provider)
);

-- ───────────────────────────────────────────────────────────────────────
-- Admin controls — disable shared keys per-user.
-- ───────────────────────────────────────────────────────────────────────
create table public.shared_key_overrides (
  user_id        uuid primary key references public.profiles(user_id) on delete cascade,
  shared_disabled boolean not null default false,
  reason         text,
  set_by         uuid references public.profiles(user_id),
  set_at         timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────
-- Parent ↔ child links
-- ───────────────────────────────────────────────────────────────────────
create table public.parent_links (
  parent_user_id uuid not null references public.profiles(user_id) on delete cascade,
  child_user_id  uuid not null references public.profiles(user_id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending','active','revoked')),
  invite_code    text unique,
  linked_at      timestamptz,
  created_at     timestamptz not null default now(),
  primary key (parent_user_id, child_user_id),
  check (parent_user_id <> child_user_id)
);

create index parent_links_child_idx on public.parent_links(child_user_id);
create index parent_links_invite_idx on public.parent_links(invite_code);

-- ───────────────────────────────────────────────────────────────────────
-- Question feedback — users can flag problematic questions
-- ───────────────────────────────────────────────────────────────────────
create table public.question_feedback (
  id              uuid primary key default uuid_generate_v4(),
  question_id     uuid not null references public.questions(id) on delete cascade,
  user_id         uuid not null references public.profiles(user_id) on delete cascade,
  reason          text not null check (reason in ('wrong-answer','confusing','too-hard','too-easy','other')),
  comment         text,
  created_at      timestamptz not null default now()
);

create index question_feedback_question_idx on public.question_feedback(question_id);

-- ───────────────────────────────────────────────────────────────────────
-- Rate limiting — per (user, day) shared-key request counter
-- ───────────────────────────────────────────────────────────────────────
create table public.shared_key_usage (
  user_id      uuid not null references public.profiles(user_id) on delete cascade,
  usage_date   date not null,
  request_count integer not null default 0,
  primary key (user_id, usage_date)
);

-- ───────────────────────────────────────────────────────────────────────
-- Generic helper trigger — keep updated_at in sync
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

create trigger xp_state_touch
  before update on public.xp_state
  for each row execute procedure public.touch_updated_at();
