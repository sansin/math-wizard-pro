-- ───────────────────────────────────────────────────────────────────────
-- Quality spot-check — run this in the Supabase SQL editor (or psql) the
-- morning after a seed run.  Outputs five sections:
--
--   1. Coverage          — fill level per (skill, difficulty)
--   2. Diversity         — per-provider distribution
--   3. Sample (random)   — 30 questions for eyeball QA
--   4. Verifier failures — questions where flagged_count >= 3
--   5. Cold spots        — pairs that fell short of the target
--
-- Recommended target: 100 verified questions per (skill, difficulty)
-- across 58 skills × 5 difficulties = 290 pairs = 29,000 questions.
-- ───────────────────────────────────────────────────────────────────────

-- ── 1. COVERAGE ──────────────────────────────────────────────────────
\echo '─── Coverage: total verified questions ──────────────────────────'
select
  count(*)              as total_questions,
  count(distinct skill_id) as skills_covered,
  count(distinct (skill_id, difficulty)) as pairs_covered
from public.questions
where verified = true;

\echo ''
\echo '─── Coverage by grade band ──────────────────────────────────────'
select
  s.grade_band,
  count(*) as questions,
  round(avg(q.difficulty), 1) as avg_difficulty,
  count(distinct q.skill_id) as skills
from public.questions q
join public.skills s on s.id = q.skill_id
where q.verified = true
group by 1
order by 1;

\echo ''
\echo '─── Coverage by module (worst-filled at top) ────────────────────'
select
  s.module,
  count(*) as questions,
  count(distinct q.skill_id) as skills,
  round(count(*)::numeric / nullif(count(distinct q.skill_id) * 5, 0), 1) as avg_per_pair
from public.questions q
join public.skills s on s.id = q.skill_id
where q.verified = true
group by 1
order by avg_per_pair asc nulls last;

-- ── 2. DIVERSITY ─────────────────────────────────────────────────────
\echo ''
\echo '─── Provider diversity (more = healthier) ──────────────────────'
select
  coalesce(provider, 'unknown') as provider,
  source,
  count(*) as questions,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as percent
from public.questions
where verified = true
group by 1, 2
order by count(*) desc;

-- ── 3. RANDOM SAMPLE FOR EYEBALL QA ──────────────────────────────────
\echo ''
\echo '─── 30 random questions across skill/difficulty ────────────────'
select
  q.skill_id,
  q.difficulty,
  q.provider,
  q.source,
  left(q.prompt, 110) as prompt_preview,
  q.answer ->> 'type' as answer_kind,
  case q.answer ->> 'type'
    when 'numeric'        then q.answer ->> 'value'
    when 'fraction'       then (q.answer ->> 'numerator') || '/' || (q.answer ->> 'denominator')
    when 'expression'     then q.answer ->> 'canonical'
    when 'multipleChoice' then 'idx ' || (q.answer ->> 'correctIndex')
    when 'text'           then q.answer ->> 'value'
  end as answer_preview,
  jsonb_array_length(q.hints) as hint_count,
  jsonb_array_length(q.solution) as step_count,
  q.flagged_count,
  q.served_count,
  q.created_at::date as created
from public.questions q
where q.verified = true
order by random()
limit 30;

-- ── 4. POTENTIAL QUALITY ISSUES ──────────────────────────────────────
\echo ''
\echo '─── Questions flagged 3+ times (auto-demoted by cache layer) ───'
select
  skill_id,
  difficulty,
  provider,
  flagged_count,
  served_count,
  case when served_count > 0
       then round(100.0 * correct_count / served_count, 1)
       else null end as correctness_pct,
  left(prompt, 90) as prompt_preview
from public.questions
where verified = true and flagged_count >= 3
order by flagged_count desc, served_count desc
limit 25;

\echo ''
\echo '─── Questions with low correctness rate (n>=10 attempts) ───────'
select
  skill_id,
  difficulty,
  provider,
  served_count,
  round(100.0 * correct_count / served_count, 1) as correctness_pct,
  left(prompt, 90) as prompt_preview
from public.questions
where verified = true
  and served_count >= 10
  and correct_count::numeric / served_count < 0.30
order by served_count desc
limit 25;

-- ── 5. COLD SPOTS — PAIRS UNDER 100 ──────────────────────────────────
\echo ''
\echo '─── Pairs still below target (re-run seed:cache to top up) ─────'
with target as (select 100 as t)
select
  q.skill_id,
  s.name,
  q.difficulty,
  count(*) as have,
  (select t from target) - count(*) as need
from public.questions q
join public.skills s on s.id = q.skill_id
cross join target
where q.verified = true
group by 1, 2, 3, target.t
having count(*) < (select t from target)
order by need desc
limit 50;

\echo ''
\echo '─── Pairs with ZERO questions (priority fix) ────────────────────'
select
  s.id as skill_id,
  s.name,
  s.grade_band,
  d as difficulty
from public.skills s
cross join (values (1),(2),(3),(4),(5)) as g(d)
where not exists (
  select 1 from public.questions q
  where q.skill_id = s.id and q.difficulty = g.d and q.verified = true
)
order by s.grade_band, s.id, d;
