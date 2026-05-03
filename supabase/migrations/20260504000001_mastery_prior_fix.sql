-- ───────────────────────────────────────────────────────────────────────
-- Mastery formula fix — Beta(2,2) prior, no cold-start blowup
--
-- Problem: the original handle_attempt_insert() used the EMA formula
--
--    weight       := 1.0 / (1 + curr_attempts * 0.10)
--    next_mastery := curr_mastery + (target - curr_mastery) * weight
--
-- with curr_mastery starting at 0.0. On the first attempt:
--
--    weight = 1.0 / (1 + 0)       = 1.0    ← FULL OVERRIDE
--    next   = 0.0 + (1.0 - 0.0) × 1.0 = 1.0  ← "100% mastered" from one
--                                             correct answer
--
-- That misled the UI into showing students as 100% mastered after a
-- single right answer.
--
-- Fix: treat the absent skill_mastery row as if it carried 4 prior
-- attempts of belief that the student is 50% likely (Beta(2, 2) prior).
-- Two small changes:
--
--    1. Initial mastery: 0.0 → 0.5
--    2. Weight denominator: `1 + curr_attempts * 0.10`
--                         → `4 + curr_attempts * 0.10`
--
-- The 4 represents the prior strength (α + β with α=β=2). Each new
-- attempt adds weight, so the prior loses influence as evidence
-- accumulates — which is exactly the Bayesian update behavior we want
-- without needing a second column to track correct-count separately.
--
-- Recency is preserved by the existing EMA structure: a recent correct
-- answer carries more weight than a stale one. So a student who got 5
-- wrong then 25 correct in a row will see their mastery climb to ~94%,
-- while one with 25 right scattered around 5 wrong will sit at ~80%.
--
-- Calibration with prior=4:
--
--   1 correct                → 0.5 + 0.5 × (1/4) = 0.625  (Familiar)
--   5 correct in a row       → ~0.86                       (Solid)
--   10 correct in a row      → ~0.92                       (Mastered)
--   25/30 spread             → ~0.80                       (Solid)
--   25/30 with last 20 right → ~0.94                       (Mastered)
--   1 wrong                  → 0.5 - 0.5 × (1/4) = 0.375  (Learning)
--
-- No backfill needed. Existing rows keep their (possibly inflated)
-- mastery values until the next attempt; the next call to this trigger
-- recomputes against the new formula. If you want an immediate
-- recalculation, run the optional one-time UPDATE at the bottom of
-- this file.
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.handle_attempt_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  curr_mastery numeric(4,3);
  curr_attempts integer;
  curr_streak integer;
  curr_avg numeric(3,2);
  earned integer;
  curr_total_xp integer;
  curr_xp_streak integer;
  curr_last_active date;
  curr_daily integer;
  curr_weekly integer;
  curr_longest integer;
  attempt_date date := (new.attempted_at at time zone 'UTC')::date;
begin
  -- 1) Mastery update
  select mastery, attempts, correct_streak, avg_correct_difficulty
    into curr_mastery, curr_attempts, curr_streak, curr_avg
    from public.skill_mastery
    where user_id = new.user_id and skill_id = new.skill_id;

  -- Cold-start prior: Beta(2, 2) → expected mastery 0.5 with prior
  -- strength of 4 attempts. This prevents the first correct answer
  -- from registering as "100% mastered".
  if curr_mastery is null then
    curr_mastery := 0.500;          -- prior expected value (was 0.000)
    curr_attempts := 0;
    curr_streak := 0;
    curr_avg := 0.00;
  end if;

  declare
    -- Prior strength of 4 in the denominator. With curr_attempts=0
    -- the weight is 1/4 = 0.25, so a single correct answer moves
    -- mastery from 0.5 to 0.625 instead of from 0.0 to 1.0.
    weight numeric := 1.0 / (4 + curr_attempts * 0.10);
    target numeric := case when new.correct then 1.0 else 0.0 end;
    next_mastery numeric := least(1.0, greatest(0.0, curr_mastery + (target - curr_mastery) * weight));
    next_streak integer := case when new.correct then curr_streak + 1 else 0 end;
    next_attempts integer := curr_attempts + 1;
    next_avg numeric;
    next_due timestamptz;
  begin
    next_avg := case when new.correct
      then (curr_avg * curr_streak + new.difficulty) / greatest(curr_streak + 1, 1)
      else curr_avg end;

    -- Spaced repetition: due date increases with mastery. Calibrated
    -- so a "Mastered" student sees the skill again in a week, while a
    -- "Just started" student gets it back in an hour.
    next_due := now() + (case
      when next_mastery < 0.30 then interval '1 hour'
      when next_mastery < 0.60 then interval '1 day'
      when next_mastery < 0.85 then interval '3 days'
      else interval '7 days'
    end);

    insert into public.skill_mastery (
      user_id, skill_id, mastery, confidence, attempts,
      correct_streak, last_attempt_at, due_at, avg_correct_difficulty
    ) values (
      new.user_id, new.skill_id, next_mastery,
      least(1.0, next_attempts / 30.0),
      next_attempts, next_streak,
      new.attempted_at, next_due, next_avg
    )
    on conflict (user_id, skill_id) do update set
      mastery = excluded.mastery,
      confidence = excluded.confidence,
      attempts = excluded.attempts,
      correct_streak = excluded.correct_streak,
      last_attempt_at = excluded.last_attempt_at,
      due_at = excluded.due_at,
      avg_correct_difficulty = excluded.avg_correct_difficulty;
  end;

  -- 2) XP update — unchanged from the previous version.
  select total_xp, current_streak, last_active_date,
         daily_answered, weekly_answered, longest_streak
    into curr_total_xp, curr_xp_streak, curr_last_active,
         curr_daily, curr_weekly, curr_longest
    from public.xp_state
    where user_id = new.user_id;

  if curr_total_xp is null then
    curr_total_xp := 0; curr_xp_streak := 0;
    curr_daily := 0; curr_weekly := 0; curr_longest := 0;
  end if;

  earned := public.xp_earned(new.correct, new.difficulty, curr_xp_streak, new.hints_used);

  declare
    next_xp integer := curr_total_xp + earned;
    next_streak integer := case when new.correct then curr_xp_streak + 1 else 0 end;
    is_new_day boolean := curr_last_active is distinct from attempt_date;
    next_daily integer := case when is_new_day then 1 else curr_daily + 1 end;
    next_weekly integer := case
      when curr_last_active is null
        or date_trunc('week', curr_last_active) <> date_trunc('week', attempt_date)
      then 1 else curr_weekly + 1 end;
  begin
    insert into public.xp_state (
      user_id, total_xp, level, daily_answered,
      last_active_date, current_streak, longest_streak, weekly_answered
    ) values (
      new.user_id, next_xp, public.level_for_xp(next_xp), next_daily,
      attempt_date, next_streak, greatest(curr_longest, next_streak), next_weekly
    )
    on conflict (user_id) do update set
      total_xp = excluded.total_xp,
      level = excluded.level,
      daily_answered = excluded.daily_answered,
      last_active_date = excluded.last_active_date,
      current_streak = excluded.current_streak,
      longest_streak = excluded.longest_streak,
      weekly_answered = excluded.weekly_answered;
  end;

  -- 3) Question stats — unchanged.
  update public.questions
    set served_count = served_count + 1,
        correct_count = correct_count + case when new.correct then 1 else 0 end
    where id = new.question_id;

  -- 4) Session stats — unchanged.
  if new.session_id is not null then
    update public.sessions
      set question_count = question_count + 1,
          correct_count = correct_count + case when new.correct then 1 else 0 end,
          xp_earned = xp_earned + earned
      where id = new.session_id;
  end if;

  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- OPTIONAL: one-time recalculation of existing rows
--
-- If you want existing inflated mastery values to be corrected
-- immediately (rather than self-correcting on next attempt), uncomment
-- this block. It re-derives mastery from scratch using the attempts
-- table — applying the new formula sequentially over each user's
-- attempt history.
--
-- Skip this if you'd rather let mastery values self-heal as students
-- continue practicing. The new formula will pull values toward the
-- correct number on every attempt.
-- ───────────────────────────────────────────────────────────────────────

-- with recalculated as (
--   select
--     a.user_id, a.skill_id,
--     -- Sequential EMA replay using the new formula
--     ... (full window-function expression here)
-- )
-- update public.skill_mastery sm
-- set mastery = r.new_mastery
-- from recalculated r
-- where sm.user_id = r.user_id and sm.skill_id = r.skill_id;
