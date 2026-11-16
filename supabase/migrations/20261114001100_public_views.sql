-- m3.1 Database: column-safe views for what other people may see.
--
-- These views run with their owner's rights on purpose (no security_invoker),
-- so they can read the base tables that the browser roles can't. Each one
-- picks only safe columns and filters every row with the same helpers the
-- access rules use. security_barrier stops a caller's own functions in a
-- WHERE clause from seeing rows the view filters out.
--
-- The Supabase database linter flags owner-rights views (lint 0010). That is
-- expected for these three and only these three (docs/DATABASE.md).

-- Profiles as other people see them (9.1). The card (username, display name,
-- photo) shows to any community member with no block between them; the
-- details only when privacy allows. Accounts under 16 never appear.
create view public.public_profiles
with (security_barrier = true)
as
select
  p.user_id,
  p.username,
  p.display_name,
  -- A photo shows only once the image check has passed on it.
  case when p.avatar_status = 'approved' or p.user_id = app.uid() then p.avatar_path end as avatar_path,
  app.can_see_profile(p.user_id) as details_visible,
  case when app.can_see_profile(p.user_id) then p.bio end as bio,
  case when app.can_see_profile(p.user_id) then p.town end as town,
  p.district,
  case when app.can_see_profile(p.user_id) then p.state end as state,
  case when app.can_see_profile(p.user_id) then p.farms end as farms,
  case when app.can_see_profile(p.user_id) then p.enterprise end as enterprise,
  case when app.can_see_profile(p.user_id) then p.farm_size_band end as farm_size_band,
  case when app.can_see_profile(p.user_id) then p.farm_size_ha end as farm_size_ha,
  case when app.can_see_profile(p.user_id) then p.real_farm_name end as real_farm_name,
  case when app.can_see_profile(p.user_id) then p.years_farming end as years_farming,
  case when app.can_see_profile(p.user_id) then p.farm_role end as farm_role,
  p.privacy_profile,
  p.created_at
from public.profiles p
where app.can_find_profile(p.user_id);

-- Leaderboard rows (9.8, 8.3). Anyone may read them while the leaderboards
-- switch is on (the public leaderboard pages). Under 16, or a private
-- profile: username and district only, no photo, no account id, no farm
-- name. A deleted, banned or suspended account shows as "Former player".
-- Rows across a block are left out.
create view public.leaderboard_rows
with (security_barrier = true)
as
select
  e.id,
  e.board,
  e.period,
  e.period_key,
  e.real_year,
  e.challenge_id,
  e.mode,
  e.district,
  e.size,
  e.start_type,
  e.enterprise,
  e.score,
  e.days,
  e.continued,
  app.board_username(e.user_id) as username,
  case when app.board_shows_owner(e.user_id) then e.user_id end as user_id,
  case when app.board_shows_owner(e.user_id) and p.avatar_status = 'approved'
       then p.avatar_path end as avatar_path,
  case when app.board_shows_owner(e.user_id) then e.farm_name end as farm_name,
  coalesce(e.user_id = app.uid(), false) as is_mine
from public.leaderboard_entries e
left join public.profiles p on p.user_id = e.user_id
where (app.feature_on('leaderboards') or app.is_admin())
  and (
    e.challenge_id is null
    or exists (select 1 from public.challenges c where c.id = e.challenge_id and c.group_id is null)
    or app.can_see_group((select c.group_id from public.challenges c where c.id = e.challenge_id))
  )
  and (
    e.user_id is null
    or app.uid() is null
    or e.user_id = app.uid()
    or not app.blocked_between(app.uid(), e.user_id)
  );

-- Farms other people may look at, read-only (9.5). The map itself comes from
-- the server, which asks can_view_farm() first.
create view public.public_farms
with (security_barrier = true)
as
select
  f.id as farm_id,
  f.owner_id,
  f.name,
  f.mode,
  f.district,
  f.size,
  f.current_day,
  f.game_date,
  f.status,
  f.started_at
from public.farms f
where f.owner_id is not null
  and f.owner_id <> coalesce(app.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  and app.can_view_farm(f.id);

grant select on public.public_profiles, public.public_farms to authenticated;
grant select on public.leaderboard_rows to anon, authenticated;
