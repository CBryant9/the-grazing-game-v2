-- m3.1 Database: server functions that belong in the database (PRD 16, 17,
-- 5.2, 21a "Your data").
--
-- Two kinds, each granted on purpose (nothing in `public` is callable by
-- default, see the foundation migration):
--   * Player calls (authenticated): act only for app.uid().
--   * Server calls (service_role only): the game server, the rollover job and
--     the Stripe webhook. Where a function needs the time it takes p_now with
--     a default of now(), the database's clock. The server never passes it;
--     tests do. No player-callable function takes a time, so a wound-forward
--     device clock changes nothing.

-- ------------------------------------------------------------ player calls

-- Sign-up (PRD 8.2, 8.3): username and date of birth, 14 or over. Makes the
-- profile, the private row, the status row and default notification settings,
-- and returns 'signed_up'. Under 14 it returns 'too_young' and records the
-- refusal against this sign-in, so trying again with an older date of birth
-- is refused too. An email with a ban still running (ban_records) is refused.
create or replace function public.complete_sign_up(
  p_username text,
  p_date_of_birth date,
  p_display_name text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.uid();
  v_email text;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'An anonymous session can not make an account.' using errcode = '42501';
  end if;
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if exists (select 1 from public.signup_refusals r where r.user_id = v_user) then
    return 'too_young';
  end if;
  select u.email into v_email from auth.users u where u.id = v_user;
  if v_email is not null and exists (
    select 1 from public.ban_records b
    where b.email_hash = app.email_hash(v_email) and (b.banned_until is null or b.banned_until > now())
  ) then
    raise exception 'banned' using errcode = 'P0001', hint = 'banned';
  end if;
  if not app.feature_on('signups_open') then
    raise exception 'signups_closed' using errcode = 'P0001', hint = 'signups_closed';
  end if;
  if exists (select 1 from public.profiles p where p.user_id = v_user) then
    raise exception 'already_signed_up' using errcode = 'P0001', hint = 'already_signed_up';
  end if;
  if p_date_of_birth is null or p_date_of_birth > app.today_sydney() then
    raise exception 'bad_date_of_birth' using errcode = '22023', hint = 'bad_date_of_birth';
  end if;
  if app.age_on(p_date_of_birth, app.today_sydney()) < 14 then
    insert into public.signup_refusals (user_id, reason) values (v_user, 'too_young')
      on conflict (user_id) do nothing;
    return 'too_young';
  end if;
  if not app.take_rate('sign_up', v_user::text) then
    raise exception 'rate_limited: sign_up' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.profiles (user_id, username, display_name)
    values (v_user, p_username, coalesce(nullif(trim(p_display_name), ''), p_username));
  insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
    values (v_user, p_date_of_birth, now());
  insert into public.account_status (user_id) values (v_user);
  insert into public.notification_settings (user_id) values (v_user);
  return 'signed_up';
end;
$$;
grant execute on function public.complete_sign_up(text, date, text) to authenticated;

-- How many farms the player may have going, and how many are, by mode.
create or replace function public.my_farm_limits()
returns table (mode text, max_active integer, active integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.mode,
         app.farm_limit(app.uid(), null, m.mode),
         (select count(*)::integer from public.farms f
           where f.owner_id = app.uid() and f.mode = m.mode and f.status = 'active')
  from (values ('daily'), ('fast')) as m (mode)
  where app.uid() is not null
$$;
grant execute on function public.my_farm_limits() to authenticated;

-- Join a group: a public group by asking, a private one with its code. Up to
-- the group's member limit (9.6).
create or replace function public.join_group(p_group uuid, p_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
  v_count integer;
begin
  if not app.can_use_community('groups') then
    raise exception 'Groups are not open to this account.' using errcode = '42501';
  end if;
  select * into g from public.groups where id = p_group for update;
  if not found then
    raise exception 'No such group.' using errcode = 'P0002';
  end if;
  if app.blocked_between(app.uid(), g.owner_id) then
    raise exception 'No such group.' using errcode = 'P0002';
  end if;
  if g.visibility = 'private' and (p_code is null or p_code <> g.invite_code) then
    raise exception 'That invite code is not right.' using errcode = '42501';
  end if;
  select count(*) into v_count from public.group_members m where m.group_id = p_group;
  if v_count >= g.member_limit then
    raise exception 'group_full' using errcode = 'P0001', hint = 'group_full';
  end if;
  insert into public.group_members (group_id, user_id, role)
    values (p_group, app.uid(), 'member')
    on conflict (group_id, user_id) do nothing;
end;
$$;
grant execute on function public.join_group(uuid, text) to authenticated;

-- The invite code, for the group's owner only.
create or replace function public.group_invite_code(p_group uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.invite_code from public.groups g
  where g.id = p_group and g.owner_id = app.uid() and app.can_use_community('groups')
$$;
grant execute on function public.group_invite_code(uuid) to authenticated;

-- Hand a group to another member (9.6).
create or replace function public.hand_over_group(p_group uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (app.can_use_community('groups') and app.is_group_owner(p_group, app.uid())) then
    raise exception 'Only the owner can hand over a group.' using errcode = '42501';
  end if;
  if not app.is_group_member(p_group, p_new_owner) or not app.is_member(p_new_owner) then
    raise exception 'The new owner must be a member of the group.' using errcode = '42501';
  end if;
  update public.group_members set role = 'member' where group_id = p_group and role = 'owner';
  update public.group_members set role = 'owner' where group_id = p_group and user_id = p_new_owner;
  update public.groups set owner_id = p_new_owner where id = p_group;
end;
$$;
grant execute on function public.hand_over_group(uuid, uuid) to authenticated;

-- Download my data (21a, Privacy Act). Everything kept about the player that
-- is theirs to see. The engine's saves are left out: they hold the game's
-- hidden rules. The farms' days, diary and scores are in.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.uid();
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select to_jsonb(u) - 'encrypted_password' from (
      select id, email, created_at from auth.users where id = v_user) u),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = v_user),
    'private', (select to_jsonb(a) from public.account_private a where a.user_id = v_user),
    'status', (select to_jsonb(s) - 'ban_reason' from public.account_status s where s.user_id = v_user),
    'links', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.profile_links x where x.user_id = v_user),
    'experience', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.profile_experience x where x.user_id = v_user),
    'education', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.profile_education x where x.user_id = v_user),
    'showcase_photos', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.farm_showcase_photos x where x.user_id = v_user),
    'farms', (select coalesce(jsonb_agg(
        to_jsonb(f) - 'rollover_claimed_at'
        || jsonb_build_object(
          'scores', (select to_jsonb(s) from public.farm_scores s where s.farm_id = f.id),
          'days', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]')
                     from public.farm_days d where d.farm_id = f.id))
      ), '[]') from public.farms f where f.owner_id = v_user),
    'follows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.follows x
                 where x.follower_id = v_user or x.followee_id = v_user),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.blocks x where x.blocker_id = v_user),
    'posts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.posts x where x.author_id = v_user),
    'post_photos', (select coalesce(jsonb_agg(to_jsonb(ph)), '[]') from public.post_photos ph
                     join public.posts p on p.id = ph.post_id where p.author_id = v_user),
    'comments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.comments x where x.author_id = v_user),
    'likes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.likes x where x.user_id = v_user),
    'groups', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.group_members x where x.user_id = v_user),
    'reports_made', (select coalesce(jsonb_agg(jsonb_build_object(
        'target_type', r.target_type, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at)), '[]')
      from public.reports r where r.reporter_id = v_user),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.notifications x where x.user_id = v_user),
    'notification_settings', (select to_jsonb(x) from public.notification_settings x where x.user_id = v_user),
    'notification_prefs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.notification_prefs x where x.user_id = v_user),
    'push_devices', (select coalesce(jsonb_agg(jsonb_build_object('device', x.device, 'created_at', x.created_at)), '[]')
      from public.push_subscriptions x where x.user_id = v_user),
    'purchases', (select coalesce(jsonb_agg(to_jsonb(x) - 'stripe_checkout_session_id' - 'stripe_payment_intent_id'), '[]')
      from public.purchases x where x.user_id = v_user),
    'entitlements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.account_entitlements x where x.user_id = v_user),
    'activity', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.activity_events x where x.user_id = v_user),
    'leaderboard_rows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.leaderboard_entries x where x.user_id = v_user),
    'challenge_entries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.challenge_entries x where x.user_id = v_user),
    'ad_events', (select coalesce(jsonb_agg(jsonb_build_object(
        'slot_id', x.slot_id, 'kind', x.kind, 'campaign_id', x.campaign_id, 'created_at', x.created_at)), '[]')
      from public.ad_events x where x.user_id = v_user)
  );
end;
$$;
grant execute on function public.export_my_data() to authenticated;

-- ------------------------------------------------------------ server calls

-- Count one use of a rate-limited action for a subject the server worked
-- out (an account id, or a hashed address; never one the caller chose).
create or replace function public.take_rate_limit(p_action text, p_subject text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select app.take_rate(p_action, p_subject)
$$;

-- The farm limit for an account or guest, by mode (PRD 5.5).
create or replace function public.farm_limit(p_owner uuid, p_guest uuid, p_mode text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select app.farm_limit(p_owner, p_guest, p_mode)
$$;

-- A guest makes an account: their farms move in (PRD 8.1). If the account
-- has no room in that mode the farm limit guard refuses, and nothing moves.
-- Returns how many farms moved.
create or replace function public.convert_guest(p_guest uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moved integer;
begin
  -- Lock the session row, so two conversions at once can't both win.
  perform 1 from public.guest_sessions g where g.id = p_guest for update;
  if not exists (select 1 from public.guest_sessions g where g.id = p_guest and g.converted_at is null) then
    raise exception 'No such guest session, or it has already moved.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_user) then
    raise exception 'The account has not finished sign-up.' using errcode = 'P0002';
  end if;
  update public.farms set owner_id = p_user, guest_session_id = null
    where guest_session_id = p_guest;
  get diagnostics v_moved = row_count;
  update public.guest_sessions set converted_to = p_user, converted_at = now() where id = p_guest;
  return v_moved;
end;
$$;

-- Daily Farm clock (PRD 5.2, 14.3). A farm's day D is simulated once the
-- farm's local date has passed D. sim_through is the last date simulated, so
-- the days owed are (local today - 1) - sim_through. Only the database's
-- clock is used.
create or replace function public.daily_days_owed(p_farm uuid, p_now timestamptz default now())
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(((p_now at time zone f.timezone)::date - 1) - f.sim_through, 0)
  from public.farms f
  where f.id = p_farm and f.mode = 'daily' and f.status = 'active'
$$;

-- The rollover (every 15 minutes) claims a batch of farms with days owed,
-- skipping any another run is working on. A claim older than 10 minutes is
-- taken as a run that died, so a missed or failed run is picked up next time.
create or replace function public.daily_claim_due(p_batch integer default 100, p_now timestamptz default now())
returns table (farm_id uuid, days_owed integer, local_today date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select f.id from public.farms f
    where f.mode = 'daily' and f.status = 'active'
      and ((p_now at time zone f.timezone)::date - 1) > f.sim_through
      and (f.rollover_claimed_at is null or f.rollover_claimed_at < p_now - interval '10 minutes')
    order by f.sim_through, f.id
    limit greatest(p_batch, 0)
    for update skip locked
  )
  update public.farms f set rollover_claimed_at = p_now
  from due where f.id = due.id
  returning f.id, ((p_now at time zone f.timezone)::date - 1) - f.sim_through,
            (p_now at time zone f.timezone)::date;
end;
$$;

-- The server simulated through p_sim_through and saved the farm. It can't
-- move past yesterday in the farm's time zone, so no extra day is ever made.
create or replace function public.daily_finish(p_farm uuid, p_sim_through date, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.farms;
begin
  select * into f from public.farms where id = p_farm and mode = 'daily' for update;
  if not found then
    raise exception 'No such Daily Farm.' using errcode = 'P0002';
  end if;
  if p_sim_through > (p_now at time zone f.timezone)::date - 1 then
    raise exception 'no_extra_days: a day can only be simulated once it is over'
      using errcode = 'P0001', hint = 'no_extra_days';
  end if;
  if p_sim_through < f.sim_through then
    raise exception 'A farm never goes back a day.' using errcode = 'P0001';
  end if;
  update public.farms
    set sim_through = p_sim_through,
        current_day = current_day + (p_sim_through - f.sim_through),
        rollover_claimed_at = null
    where id = p_farm;
end;
$$;

-- Change a Daily Farm's time zone: at most once every 30 days, and never for
-- an extra day (5.2). The days owed after the change are no more than before.
create or replace function public.change_farm_timezone(
  p_farm uuid,
  p_timezone text,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.farms;
  v_shift integer;
begin
  select * into f from public.farms where id = p_farm and mode = 'daily' for update;
  if not found then
    raise exception 'No such Daily Farm.' using errcode = 'P0002';
  end if;
  if f.timezone = p_timezone then
    return;
  end if;
  if f.timezone_changed_at is not null and f.timezone_changed_at > p_now - interval '30 days' then
    raise exception 'timezone_locked: the time zone can change once every 30 days'
      using errcode = 'P0001', hint = 'timezone_locked';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    raise exception 'Unknown time zone: %', p_timezone using errcode = '22023';
  end if;
  -- A zone further east is already on a later date. Move sim_through on by
  -- the same, so the farm waits rather than gaining a day.
  v_shift := greatest((p_now at time zone p_timezone)::date - (p_now at time zone f.timezone)::date, 0);
  update public.farms
    set timezone = p_timezone,
        timezone_changed_at = p_now,
        sim_through = f.sim_through + v_shift
    where id = p_farm;
end;
$$;

-- May this viewer see this farm read-only (9.5)? The server asks before it
-- builds a farm view for anyone but the owner.
create or replace function public.can_view_farm(p_viewer uuid, p_farm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_view_farm_for(p_viewer, p_farm)
$$;

-- Files to remove from Storage before an account is deleted (21a): every
-- file in a folder named for the account in any bucket (linked to a row or
-- not), the farms' map snapshots, and the photos of groups that go with the
-- account (where the player is the only member). The server removes these,
-- then deletes the Auth user; the cascades remove the rest.
create or replace function public.account_storage_paths(p_user uuid)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct o.bucket_id::text, o.name::text from storage.objects o
  where (storage.foldername(o.name))[1] = p_user::text
     or (o.bucket_id = 'snapshots' and (storage.foldername(o.name))[1] in (
           select f.id::text from public.farms f where f.owner_id = p_user))
     or (o.bucket_id = 'group-photos' and (storage.foldername(o.name))[1] in (
           select g.id::text from public.groups g
           where g.owner_id = p_user
             and not exists (select 1 from public.group_members m
                             where m.group_id = g.id and m.user_id <> p_user)))
$$;

-- Roll one day's ad events into ad_daily, then remove raw events older than
-- 35 days (BUILD_PLAN 5.2: ad events batched and rolled up nightly).
create or replace function public.rollup_ad_events(p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ad_daily as d (day, slot_id, campaign_id, kind, count)
    select p_day, e.slot_id, e.campaign_id, e.kind, count(*)
    from public.ad_events e
    where e.created_at >= (p_day::timestamp at time zone 'Australia/Sydney')
      and e.created_at < ((p_day + 1)::timestamp at time zone 'Australia/Sydney')
    group by e.slot_id, e.campaign_id, e.kind
  on conflict (day, slot_id, campaign_id, kind) do update set count = excluded.count;
  delete from public.ad_events where created_at < now() - interval '35 days';
end;
$$;

-- Housekeeping: old rate-limit windows, and guests not seen for 30 days
-- (their farms go with them, PRD 8.1: a guest farm is not kept for ever).
create or replace function public.prune_housekeeping(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limit_hits where window_start < p_now - interval '2 days';
  delete from public.guest_sessions
    where converted_at is null and last_seen_at < p_now - interval '30 days';
end;
$$;

-- Who may call what. Postgres lets PUBLIC run every new function, and a
-- per-schema default can't take that away, so it is taken away here, then
-- each function is granted to the one role that needs it.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.complete_sign_up(text, date, text),
  public.my_farm_limits(),
  public.join_group(uuid, text),
  public.group_invite_code(uuid),
  public.hand_over_group(uuid, uuid),
  public.export_my_data()
to authenticated;
grant execute on function
  public.take_rate_limit(text, text),
  public.farm_limit(uuid, uuid, text),
  public.convert_guest(uuid, uuid),
  public.daily_days_owed(uuid, timestamptz),
  public.daily_claim_due(integer, timestamptz),
  public.daily_finish(uuid, date, timestamptz),
  public.change_farm_timezone(uuid, text, timestamptz),
  public.can_view_farm(uuid, uuid),
  public.account_storage_paths(uuid),
  public.rollup_ad_events(date),
  public.prune_housekeeping(timestamptz)
to service_role;
