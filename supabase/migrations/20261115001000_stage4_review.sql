-- Stage 4, the security review of the community (m4.2).
--
-- 1. Staff get the same community view as any member. The helpers that the community's rules
--    use no longer let a moderator or an admin through: before, staff saw an under-16 profile
--    and its posts, private profiles' details, removed comments and followers-only posts across
--    a block on the community pages, because those pages run as the signed-in player. Staff
--    powers belong in the admin tools, which run on the server's own connection.
-- 2. A private profile's posts are seen by their author only (PRD 9.1), whatever the post's own
--    setting says.
-- 3. Players can no longer write to Storage with their own token: only the server stores a photo,
--    after cleaning it. The insert rules for avatars, group photos and post photos are gone.
-- 4. A database limit on photos: an hourly rate and a daily cap for each account.
-- 5. An index for the Friends tab (posts by one author, newest first, not in a group, not removed).
-- 6. Like counts through one safe count each, not a rule check per like row.

-- ------------------------------------------------------------------ 1 and 2

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
    else app.community_ok(p_viewer)
      and app.member_raw(p_owner)
      and not app.blocked_pair(p_viewer, p_owner)
  end
$$;

create or replace function app.can_find_profile(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_find_profile_for(app.uid(), p_owner)
$$;

create or replace function app.can_see_profile(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.uid() is null or p_owner is null then false
    when p_owner = app.uid() then true
    else app.can_find_profile_for(app.uid(), p_owner)
      and exists (
        select 1 from public.profiles p
        where p.user_id = p_owner
          and (
            p.privacy_profile = 'public'
            or (p.privacy_profile = 'followers' and app.follows_accepted(app.uid(), p_owner))
          )
      )
  end
$$;

create or replace function app.can_see_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_use_community('groups')
    and exists (
      select 1 from public.groups g
      where g.id = p_group
        and (g.visibility = 'public' or app.group_member_raw(g.id, app.uid()))
        and (g.owner_id is null or not app.blocked_pair(app.uid(), g.owner_id))
    )
$$;

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
    when app.uid() is null then false
    when not app.can_use_community('feed_posts') then false
    when p_author = app.uid() then true
    when p_removed_at is not null then false
    when not app.member_raw(p_author) then false
    when app.blocked_pair(app.uid(), p_author) then false
    -- A private profile: only its owner sees its posts (9.1).
    when exists (
      select 1 from public.profiles pr where pr.user_id = p_author and pr.privacy_profile = 'private'
    ) then false
    when p_group is not null then
      app.can_use_community('groups') and app.group_member_raw(p_group, app.uid())
    when p_visibility = 'public' then true
    else app.follows_accepted(app.uid(), p_author)
  end
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
          c.author_id = app.uid()
          or (c.removed_at is null
              and app.member_raw(c.author_id)
              and not app.blocked_pair(app.uid(), c.author_id))
        )
       from public.comments c where c.id = p_comment),
    false
  )
$$;

drop policy comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated
  using (
    app.post_visible(post_id)
    and (
      author_id = (select app.uid())
      or (removed_at is null
          and app.is_member(author_id)
          and not app.blocked_between((select app.uid()), author_id))
    )
  );

drop policy post_photos_read on public.post_photos;
create policy post_photos_read on public.post_photos for select to authenticated
  using (
    app.post_visible(post_id)
    and (moderation_status = 'approved' or app.post_author(post_id) = (select app.uid()))
  );

drop policy farm_showcase_photos_read on public.farm_showcase_photos;
create policy farm_showcase_photos_read on public.farm_showcase_photos for select to authenticated
  using (
    user_id = (select app.uid())
    or (moderation_status = 'approved' and app.can_see_profile(user_id))
  );

-- ------------------------------------------------------------------ 3

drop policy gg_avatars_insert on storage.objects;
drop policy gg_group_photos_insert on storage.objects;
drop policy gg_post_photos_insert on storage.objects;

-- ------------------------------------------------------------------ 4

-- Stand-in figures (docs/DEVELOPMENT_LOG.md, "Calls for Claudia"): a post holds up to 4 photos.
insert into public.rate_limit_rules (action, max_count, window_seconds, new_account_max, new_account_days) values
  ('photo', 24, 3600, 8, 7),
  ('photo_day', 80, 86400, 20, 7)
on conflict (action) do nothing;

create or replace function app.photo_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_who text := app.uid()::text;
begin
  if not app.acting_as_player() or v_who is null then
    return new;
  end if;
  if tg_table_name = 'profiles' then
    if new.avatar_path is null or new.avatar_path is not distinct from old.avatar_path then
      return new;
    end if;
  end if;
  if not app.take_rate('photo', v_who) or not app.take_rate('photo_day', v_who) then
    raise exception 'rate_limited: photo' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;
revoke execute on function app.photo_rate() from public, anon, authenticated;
grant execute on function app.photo_rate() to service_role;

create trigger post_photos_rate before insert on public.post_photos
  for each row execute function app.photo_rate();
create trigger farm_showcase_photos_rate before insert on public.farm_showcase_photos
  for each row execute function app.photo_rate();
create trigger profiles_avatar_rate before update of avatar_path on public.profiles
  for each row execute function app.photo_rate();

-- ------------------------------------------------------------------ 5

create index posts_author_feed on public.posts (author_id, created_at desc, id desc)
  where group_id is null and removed_at is null;

-- ------------------------------------------------------------------ 6

-- How many likes, told only to someone who may see the post or comment. Every like counts,
-- whoever gave it (a count is not an identity).
create or replace function app.like_count_post(p_post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.post_visible(p_post)
    then (select count(*)::int from public.likes l where l.post_id = p_post) else 0 end
$$;

create or replace function app.like_count_comment(p_comment uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.comment_visible(p_comment)
    then (select count(*)::int from public.likes l where l.comment_id = p_comment) else 0 end
$$;

revoke execute on function app.like_count_post(uuid), app.like_count_comment(uuid)
  from public, anon, authenticated;
-- To both browser roles, like the other helpers the rules and views call (a visitor is told 0).
grant execute on function app.like_count_post(uuid), app.like_count_comment(uuid)
  to anon, authenticated, service_role;
