-- ───────────────────────────────────────────────────────────────────────
-- Mastery & XP triggers
--
-- After every attempt insert, update the user's per-skill mastery, their
-- XP state, and bump the served_count + correct_count on the question.
-- ───────────────────────────────────────────────────────────────────────

-- XP table — exponential level thresholds.
create table public.level_thresholds (
  level smallint primary key,
  xp_required integer not null,
  title text not null
);

insert into public.level_thresholds (level, xp_required, title) values
  (1,      0, 'Apprentice'),
  (2,    100, 'Number Scout'),
  (3,    250, 'Pattern Finder'),
  (4,    500, 'Problem Solver'),
  (5,    850, 'Equation Explorer'),
  (6,   1300, 'Fraction Hero'),
  (7,   1850, 'Algebra Adept'),
  (8,   2550, 'Geometry Guide'),
  (9,   3400, 'Probability Sage'),
  (10,  4400, 'Calculus Cadet'),
  (11,  5550, 'Math Knight'),
  (12,  6900, 'Logic Master'),
  (13,  8400, 'Theorem Hunter'),
  (14, 10100, 'Pi Whisperer'),
  (15, 12100, 'Function Wizard'),
  (16, 14400, 'Prime Sorcerer'),
  (17, 17000, 'Infinity Seeker'),
  (18, 20000, 'Topology Tactician'),
  (19, 23500, 'Set Conjurer'),
  (20, 27500, 'Vector Virtuoso'),
  (21, 32000, 'Matrix Mage'),
  (22, 37000, 'Differential Druid'),
  (23, 42500, 'Integral Illusionist'),
  (24, 48500, 'Series Sage'),
  (25, 55000, 'Limit Lord'),
  (26, 62000, 'Theorem Architect'),
  (27, 70000, 'Proof Paragon'),
  (28, 79000, 'Axiom Adept'),
  (29, 89000, 'Math Wizard Master'),
  (30,100000, 'Archmage of Mathematics');

create or replace function public.level_for_xp(p_xp integer) returns smallint
language sql stable as $$
  select coalesce(
    (select level from public.level_thresholds
     where xp_required <= p_xp
     order by xp_required desc
     limit 1),
    1::smallint
  );
$$;

-- ─── XP earned per attempt ─────────────────────────────────────────────
-- Base 10 + difficulty bonus + streak bonus (capped). No XP on wrong.
create or replace function public.xp_earned(
  p_correct boolean,
  p_difficulty smallint,
  p_streak integer,
  p_hints_used smallint
) returns integer
language plpgsql immutable as $$
declare
  base_xp integer := 10;
  diff_bonus integer := 0;
  streak_bonus integer := 0;
  hint_penalty integer := 0;
begin
  if not p_correct then return 0; end if;
  diff_bonus := case
    when p_difficulty = 1 then 0
    when p_difficulty = 2 then 3
    when p_difficulty = 3 then 6
    when p_difficulty = 4 then 10
    when p_difficulty = 5 then 15
    else 0 end;
  streak_bonus := least(p_streak * 2, 20);
  hint_penalty := case p_hints_used
    when 0 then 0
    when 1 then 2
    when 2 then 4
    else 6 end;
  return greatest(base_xp + diff_bonus + streak_bonus - hint_penalty, 1);
end;
$$;

-- ─── On attempt insert: update mastery, xp, question stats ─────────────
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

  if curr_mastery is null then
    curr_mastery := 0.000;
    curr_attempts := 0;
    curr_streak := 0;
    curr_avg := 0.00;
  end if;

  -- Simple Bayesian-ish update: weight new evidence more when attempts is small.
  declare
    weight numeric := 1.0 / (1 + curr_attempts * 0.10);
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
    -- Spaced repetition: due date increases with mastery.
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

  -- 2) XP update
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

  -- 3) Question stats
  update public.questions
    set served_count = served_count + 1,
        correct_count = correct_count + case when new.correct then 1 else 0 end
    where id = new.question_id;

  -- 4) Session stats
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

create trigger attempts_after_insert
  after insert on public.attempts
  for each row execute procedure public.handle_attempt_insert();

-- ─── handle_new_user — auto-create profile + xp_state ──────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, grade_band, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Wizard'),
    coalesce(new.raw_user_meta_data->>'grade_band', '4-5'),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (user_id) do nothing;

  insert into public.xp_state (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
