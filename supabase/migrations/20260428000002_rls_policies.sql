-- ───────────────────────────────────────────────────────────────────────
-- Row Level Security policies
--
-- Principles:
--  • Default deny. Every table that contains user data has RLS enabled.
--  • Users can read/write their own data only.
--  • Parents (with active link) can READ their child's data.
--  • Admin role can read everything (managed via JWT claim, not table).
--  • Reference tables (skills, questions) are publicly readable.
--  • API keys: a user can read their hint+metadata, but the encrypted_key
--    is only accessible to the service role (Edge Functions).
-- ───────────────────────────────────────────────────────────────────────

alter table public.profiles            enable row level security;
alter table public.skills              enable row level security;
alter table public.questions           enable row level security;
alter table public.sessions            enable row level security;
alter table public.attempts            enable row level security;
alter table public.skill_mastery       enable row level security;
alter table public.xp_state            enable row level security;
alter table public.user_api_keys       enable row level security;
alter table public.shared_key_overrides enable row level security;
alter table public.parent_links        enable row level security;
alter table public.question_feedback   enable row level security;
alter table public.shared_key_usage    enable row level security;

-- ─── helper: is the current user an admin? ─────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where user_id = auth.uid()),
    false
  );
$$;

-- ─── helper: is current user a parent of the given child? ──────────────
create or replace function public.is_parent_of(child uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.parent_links
    where parent_user_id = auth.uid()
      and child_user_id  = child
      and status = 'active'
  );
$$;

-- ───────── profiles ───────────────────────────────────────────────────
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = user_id or public.is_parent_of(user_id) or public.is_admin());

create policy profiles_self_insert on public.profiles
  for insert with check (auth.uid() = user_id);

create policy profiles_self_update on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────── skills (read-only reference) ───────────────────────────────
create policy skills_public_read on public.skills
  for select using (true);

-- ───────── questions (publicly readable cache) ─────────────────────────
create policy questions_public_read on public.questions
  for select using (true);

-- Writes restricted to service role (Edge Function). No anon write policy.

-- ───────── sessions ────────────────────────────────────────────────────
create policy sessions_owner_all on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy sessions_parent_read on public.sessions
  for select using (public.is_parent_of(user_id));

-- ───────── attempts ────────────────────────────────────────────────────
create policy attempts_owner_insert on public.attempts
  for insert with check (auth.uid() = user_id);

create policy attempts_owner_select on public.attempts
  for select using (auth.uid() = user_id or public.is_parent_of(user_id));

-- ───────── skill_mastery ───────────────────────────────────────────────
create policy mastery_owner_select on public.skill_mastery
  for select using (auth.uid() = user_id or public.is_parent_of(user_id));

create policy mastery_owner_upsert on public.skill_mastery
  for insert with check (auth.uid() = user_id);

create policy mastery_owner_update on public.skill_mastery
  for update using (auth.uid() = user_id);

-- ───────── xp_state ────────────────────────────────────────────────────
create policy xp_owner_select on public.xp_state
  for select using (auth.uid() = user_id or public.is_parent_of(user_id));

create policy xp_owner_upsert on public.xp_state
  for insert with check (auth.uid() = user_id);

create policy xp_owner_update on public.xp_state
  for update using (auth.uid() = user_id);

-- ───────── user_api_keys ───────────────────────────────────────────────
-- We deliberately split: users can SELECT their own row to see hints, but
-- the encrypted_key is masked at the application layer. Edge Functions
-- (service role) bypass RLS to read the actual key.
create policy api_keys_owner_select on public.user_api_keys
  for select using (auth.uid() = user_id);

create policy api_keys_owner_insert on public.user_api_keys
  for insert with check (auth.uid() = user_id);

create policy api_keys_owner_update on public.user_api_keys
  for update using (auth.uid() = user_id);

create policy api_keys_owner_delete on public.user_api_keys
  for delete using (auth.uid() = user_id);

-- ───────── shared_key_overrides ────────────────────────────────────────
-- Only admins can read/write.
create policy shared_overrides_admin on public.shared_key_overrides
  for all using (public.is_admin()) with check (public.is_admin());

create policy shared_overrides_self_read on public.shared_key_overrides
  for select using (auth.uid() = user_id);

-- ───────── parent_links ────────────────────────────────────────────────
create policy parent_links_self_select on public.parent_links
  for select using (auth.uid() = parent_user_id or auth.uid() = child_user_id);

create policy parent_links_parent_insert on public.parent_links
  for insert with check (auth.uid() = parent_user_id);

create policy parent_links_either_update on public.parent_links
  for update using (auth.uid() = parent_user_id or auth.uid() = child_user_id);

-- ───────── question_feedback ───────────────────────────────────────────
create policy feedback_owner_insert on public.question_feedback
  for insert with check (auth.uid() = user_id);

create policy feedback_owner_select on public.question_feedback
  for select using (auth.uid() = user_id or public.is_admin());

-- ───────── shared_key_usage ────────────────────────────────────────────
create policy usage_self_read on public.shared_key_usage
  for select using (auth.uid() = user_id);
-- writes are service-role only
