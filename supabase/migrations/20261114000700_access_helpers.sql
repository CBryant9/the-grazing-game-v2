-- m3.1 Database: helpers the access rules call.
--
-- They live in `app` (not exposed by the Data API). Each one that reads
-- another table is security definer, so a rule can ask "is this account 16 or
-- over?" without the caller ever being able to read a date of birth. Every
-- one sets search_path to '' and names its tables in full.

-- Is this request from a browser (a player's or a visitor's token), rather
-- than the server or a migration? Read from the request's token, because
-- inside a security definer function current_user is the function's owner.
create or replace function app.acting_as_player()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon')
$$;

-- Is this account an admin? A moderator or admin?
create or replace function app.is_admin_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_status s
    where s.user_id = p_user and s.role = 'admin'
  )
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin_user(auth.uid())
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_status s
    where s.user_id = auth.uid() and s.role in ('admin', 'moderator')
  )
$$;

-- Is a feature switch on? A missing switch is off.
create or replace function app.feature_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.feature_switches f where f.key = p_key), false)
$$;

-- An account that may take part in the community: has a profile, is 16 or
-- over today (Sydney date), and is not banned or suspended (PRD 8.3, 9.9).
-- Turning 16 opens the community by itself: nothing has to run.
create or replace function app.is_member(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.account_private a on a.user_id = p.user_id
    left join public.account_status s on s.user_id = p.user_id
    where p.user_id = p_user
      and app.age_on(a.date_of_birth, app.today_sydney()) >= 16
      and (s.banned_at is null)
      and (s.suspended_until is null or s.suspended_until <= now())
  )
$$;

-- May this account use the community (or one part of it) right now? The
-- community switch, and the part's own switch, must be on. Admins may use it
-- with the switches off, to check it before launch.
create or replace function app.community_ok(p_user uuid, p_part text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and app.is_member(p_user)
    and (
      app.is_admin_user(p_user)
      or (app.feature_on('community') and (p_part is null or app.feature_on(p_part)))
    )
$$;

create or replace function app.can_use_community(p_part text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.community_ok(auth.uid(), p_part)
$$;

-- Has either blocked the other? Blocks hide both ways (9.2).
create or replace function app.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  )
$$;

create or replace function app.follows_accepted(p_follower uuid, p_followee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = p_follower and f.followee_id = p_followee and f.status = 'accepted'
  )
$$;

-- May the viewer find this account at all (username, display name, photo)?
-- Both must be community members with no block between them.
create or replace function app.can_find_profile_for(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_owner = p_viewer then true
    when app.is_admin_user(p_viewer) then true
    else app.community_ok(p_viewer)
      and app.is_member(p_owner)
      and not app.blocked_between(p_viewer, p_owner)
  end
$$;

create or replace function app.can_find_profile(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_find_profile_for(auth.uid(), p_owner)
    or (app.is_staff() and p_owner is not null)
$$;

-- May the viewer see the profile's details? Public, or followers only and
-- the viewer is an accepted follower (9.1). A private profile: only its owner.
create or replace function app.can_see_profile(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or p_owner is null then false
    when p_owner = auth.uid() then true
    when app.is_staff() then true
    else app.can_find_profile_for(auth.uid(), p_owner)
      and exists (
        select 1 from public.profiles p
        where p.user_id = p_owner
          and (
            p.privacy_profile = 'public'
            or (p.privacy_profile = 'followers' and app.follows_accepted(auth.uid(), p_owner))
          )
      )
  end
$$;

create or replace function app.is_group_member(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user
  )
$$;

create or replace function app.is_group_owner(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.groups g where g.id = p_group and g.owner_id = p_user)
$$;

-- A public group can be seen by any member of the community; a private one by its members.
create or replace function app.can_see_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_staff()
    or (
      app.can_use_community('groups')
      and exists (
        select 1 from public.groups g
        where g.id = p_group
          and (g.visibility = 'public' or app.is_group_member(g.id, auth.uid()))
          and not app.blocked_between(auth.uid(), g.owner_id)
      )
    )
$$;

-- May the viewer see a post with these fields? Used by the posts rule itself
-- (with the row's own columns) and, through post_visible, by comments, likes
-- and photos.
create or replace function app.post_row_visible(
  p_author uuid,
  p_visibility text,
  p_group uuid,
  p_removed_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when app.is_staff() then true
    when not app.can_use_community('feed_posts') then false
    when p_author = auth.uid() then true
    when p_removed_at is not null then false
    when not app.is_member(p_author) then false
    when app.blocked_between(auth.uid(), p_author) then false
    when p_group is not null then
      app.can_use_community('groups') and app.is_group_member(p_group, auth.uid())
    when p_visibility = 'public' then true
    else app.follows_accepted(auth.uid(), p_author)
  end
$$;

create or replace function app.post_visible(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.post_row_visible(p.author_id, p.visibility, p.group_id, p.removed_at)
       from public.posts p where p.id = p_post),
    false
  )
$$;

create or replace function app.post_author(p_post uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.author_id from public.posts p where p.id = p_post
$$;

create or replace function app.comment_visible(p_comment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.post_visible(c.post_id)
        and (
          c.author_id = auth.uid()
          or app.is_staff()
          or (c.removed_at is null
              and app.is_member(c.author_id)
              and not app.blocked_between(auth.uid(), c.author_id))
        )
       from public.comments c where c.id = p_comment),
    false
  )
$$;

create or replace function app.comment_author(p_comment uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.author_id from public.comments c where c.id = p_comment
$$;

-- Does the ticker show this account's events to the viewer (9.4)? Only
-- community members aged 16+ who switched ticker activity on, no block.
create or replace function app.ticker_visible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when not app.can_use_community('activity_ticker') then false
    when p_user = auth.uid() then true
    else app.is_member(p_user)
      and not app.blocked_between(auth.uid(), p_user)
      and exists (select 1 from public.profiles p where p.user_id = p_user and p.ticker_opt_in)
  end
$$;

-- May the viewer look at this farm read-only (9.5)? Daily Farms only, the
-- farm viewing switch on, both community members, no block, and the owner's
-- farm view setting allows it. Used by the public_farms view and by the
-- server before it builds a farm view for someone else.
create or replace function app.can_view_farm_for(p_viewer uuid, p_farm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p_viewer is null then false
      when f.owner_id = p_viewer then true
      when f.mode <> 'daily' or f.owner_id is null then false
      when not app.community_ok(p_viewer, 'farm_viewing') then false
      when not app.is_member(f.owner_id) then false
      when app.blocked_between(p_viewer, f.owner_id) then false
      when p.privacy_farm_view = 'public' then true
      when p.privacy_farm_view = 'followers' then app.follows_accepted(p_viewer, f.owner_id)
      else false
    end
    from public.farms f
    left join public.profiles p on p.user_id = f.owner_id
    where f.id = p_farm
  ), false)
$$;

create or replace function app.owns_farm(p_farm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.farms f where f.id = p_farm and f.owner_id = auth.uid())
$$;

-- A text that holds a blocked word? Usernames are checked letter by letter
-- (underscores taken out); other text word by word, so "Scunthorpe" problems
-- stay rare.
create or replace function app.blocked_word_in(p_text text, p_whole_words boolean default true)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_text is not null and exists (
    select 1 from public.word_filter w
    where w.kind = 'block'
      and case
        when p_whole_words then lower(p_text) ~ ('\m' || w.term || '\M')
        else replace(lower(p_text), '_', '') like '%' || replace(w.term, ' ', '') || '%'
      end
  )
$$;

create or replace function app.flagged_word_in(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_text is not null and exists (
    select 1 from public.word_filter w
    where w.kind = 'flag' and lower(p_text) ~ ('\m' || w.term || '\M')
  )
$$;

-- A uuid from text, or null (for storage folder names).
create or replace function app.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- Count one use of a rate-limited action. False when the subject is over the
-- limit for the current window. Only counts if the caller's transaction commits.
create or replace function app.take_rate(p_action text, p_subject text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rate_limit_rules;
  v_window timestamptz;
  v_max integer;
  v_hits integer;
  v_account_age interval;
begin
  select * into r from public.rate_limit_rules where action = p_action;
  if not found then
    return true;
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / r.window_seconds) * r.window_seconds);
  v_max := r.max_count;
  if r.new_account_max is not null then
    select now() - p.created_at into v_account_age
      from public.profiles p where p.user_id = app.try_uuid(p_subject);
    if v_account_age is not null and v_account_age < make_interval(days => r.new_account_days) then
      v_max := least(v_max, r.new_account_max);
    end if;
  end if;
  insert into public.rate_limit_hits as h (action, subject, window_start, hits)
    values (p_action, p_subject, v_window, 1)
    on conflict (action, subject, window_start) do update set hits = h.hits + 1
    returning h.hits into v_hits;
  return v_hits <= v_max;
end;
$$;

-- Each helper the access rules call must be callable by the browser roles.
-- (They are not reachable through the Data API: `app` is not exposed.)
grant execute on all functions in schema app to anon, authenticated, service_role;
