-- Leaderboard scoring
--
-- Scoring formula (deliberately simple + defensible, tune the weights below if the
-- project owner wants a different balance later):
--   +15 points for every parking report you filed that reached status = 'resolved'
--      (you flagged a real violation and it got fixed)
--   +20 points for every Lost & Found item you posted as type = 'found' that reached
--      status = 'resolved' (you helped reunite someone with their belongings)
--   +10 points for every claim you filed on a Lost & Found item that the reporter
--      accepted (you successfully claimed a lost item, or helped return a found one)
--
-- "Total Reports" on the leaderboard is the raw count of resolved parking reports +
-- returned lost & found items (the two "reporting" style contributions), matching the
-- existing UI copy ("Earn points by reporting parking violations and turning in lost
-- items").
--
-- This is exposed only through a SECURITY DEFINER RPC (get_leaderboard) so that
-- unauthenticated/anon users can't bulk-read profile data, and so we control exactly
-- which columns are exposed (mirrors the pattern already used by
-- forum_public_profiles in 023_forum_public_profiles_verified.sql).

create or replace view public.user_points as
select
  p.id as profile_id,
  coalesce(pr.resolved_reports, 0) as resolved_parking_reports,
  coalesce(lf.returned_items, 0) as returned_lost_and_found_items,
  coalesce(cl.accepted_claims, 0) as accepted_claims,
  (coalesce(pr.resolved_reports, 0) * 15)
    + (coalesce(lf.returned_items, 0) * 20)
    + (coalesce(cl.accepted_claims, 0) * 10) as points,
  (coalesce(pr.resolved_reports, 0) + coalesce(lf.returned_items, 0)) as total_reports
from public.profiles p
left join (
  select reported_by as profile_id, count(*)::int as resolved_reports
  from public.parking_reports
  where status = 'resolved' and reported_by is not null
  group by reported_by
) pr on pr.profile_id = p.id
left join (
  select reporter_id as profile_id, count(*)::int as returned_items
  from public.lost_and_found_reports
  where type = 'found' and status = 'resolved' and not is_deleted
  group by reporter_id
) lf on lf.profile_id = p.id
left join (
  select claimer_id as profile_id, count(*)::int as accepted_claims
  from public.lost_and_found_claims
  where status = 'accepted'
  group by claimer_id
) cl on cl.profile_id = p.id;

comment on view public.user_points is
  'Per-user gamification score. See migration 030_leaderboard_scoring.sql for the formula.';

-- Lock the view down directly; access is only via the RPC below.
revoke all on public.user_points from anon, authenticated;

drop function if exists public.get_leaderboard(int);

create or replace function public.get_leaderboard(_limit int default 50)
returns table (
  rank bigint,
  profile_id uuid,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  points int,
  total_reports int,
  resolved_parking_reports int,
  returned_lost_and_found_items int,
  accepted_claims int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    row_number() over (order by up.points desc, up.total_reports desc, up.profile_id asc) as rank,
    p.id as profile_id,
    p.first_name,
    p.last_name,
    p.username,
    p.avatar_url,
    up.points,
    up.total_reports,
    up.resolved_parking_reports,
    up.returned_lost_and_found_items,
    up.accepted_claims
  from public.user_points up
  join public.profiles p on p.id = up.profile_id
  where up.points > 0
  order by up.points desc, up.total_reports desc, up.profile_id asc
  limit greatest(least(coalesce(_limit, 50), 200), 1);
$$;

grant execute on function public.get_leaderboard(int) to authenticated;
revoke all on function public.get_leaderboard(int) from anon;
