-- ───────────────────────────────────────────────────────────────────────
-- Add audit-state tracking to public.questions so the quality audit can
-- be incremental: skip rows that have already been reviewed under the
-- current rules, and only process newly-seeded or freshly-patched rows.
--
-- last_audited_at      — timestamp of the most recent successful audit
--                        pass. NULL means "never audited" (e.g., just
--                        inserted by the seeder).
-- last_audit_version   — short integer that bumps when the audit's
--                        detection rules change. Setting this to a higher
--                        value forces re-audit of rows whose
--                        last_audit_version is below it.
--
-- The audit script's default behavior is:
--   WHERE verified = true
--     AND (last_audited_at IS NULL
--          OR last_audit_version IS NULL
--          OR last_audit_version < CURRENT_RULES_VERSION)
--
-- Pass --all to override and re-audit every row regardless.
-- ───────────────────────────────────────────────────────────────────────

alter table public.questions
  add column if not exists last_audited_at timestamptz,
  add column if not exists last_audit_version smallint;

-- Index on last_audited_at IS NULL so the gate query is fast even at scale
-- (we expect tens of thousands of rows). A partial index over the IS NULL
-- predicate is the right shape for this.
create index if not exists questions_unaudited_idx
  on public.questions (verified)
  where last_audited_at is null;
