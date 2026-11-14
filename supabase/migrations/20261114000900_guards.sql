-- m3.1 Database: guards that hold whoever writes (triggers run for the
-- server too): farm limits, the Daily Farm clock, the word filter, follow
-- approval, one level of replies, blocks undoing follows, rate limits.

-- ------------------------------------------------------------ farm limits

-- How many farms of a mode this owner (or guest) may have going (PRD 5.5).
create or replace function app.farm_limit(p_owner uuid, p_guest uuid, p_mode text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select l.max_active from public.farm_limits l
    where l.mode = p_mode
      and l.tier = case
        when p_owner is null then 'guest'
        when exists (
          select 1 from public.account_entitlements e
          where e.user_id = p_owner and e.entitlement = 'farm_pack' and e.revoked_at is null
        ) then 'pack'
        else 'free'
      end
  ), 0)
$$;

create or replace function app.farms_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
  v_limit integer;
begin
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;

  if new.status = 'active' and (
    tg_op = 'INSERT'
    or old.status <> 'active'
    or old.owner_id is distinct from new.owner_id
    or old.guest_session_id is distinct from new.guest_session_id
    or old.mode <> new.mode
  ) then
    -- One at a time per owner, so two requests at once can't both squeeze in.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(coalesce(new.owner_id, new.guest_session_id)::text)
    );
    select count(*) into v_active from public.farms f
      where f.status = 'active' and f.mode = new.mode and f.id <> new.id
        and (f.owner_id = new.owner_id or f.guest_session_id = new.guest_session_id);
    v_limit := app.farm_limit(new.owner_id, new.guest_session_id, new.mode);
    if v_active >= v_limit then
      raise exception 'farm_limit: % of % % farms already going', v_active, v_limit, new.mode
        using errcode = 'P0001', hint = 'farm_limit';
    end if;
  end if;
  return new;
end;
$$;
create trigger farms_guard before insert or update on public.farms
  for each row execute function app.farms_guard();

-- --------------------------------------------------------------- the words

create or replace function app.words_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
begin
  if tg_table_name = 'profiles' then
    if app.blocked_word_in(new.username, false) then
      raise exception 'word_filter: that username is not allowed' using errcode = 'P0001', hint = 'word_filter';
    end if;
    v_text := concat_ws(' ', new.display_name, new.bio, new.town, new.real_farm_name);
  elsif tg_table_name = 'groups' then
    v_text := concat_ws(' ', new.name, new.description);
  else
    v_text := new.body;
  end if;
  if app.blocked_word_in(v_text) then
    raise exception 'word_filter: that text is not allowed' using errcode = 'P0001', hint = 'word_filter';
  end if;
  return new;
end;
$$;
create trigger profiles_words before insert or update on public.profiles
  for each row execute function app.words_guard();
create trigger groups_words before insert or update on public.groups
  for each row execute function app.words_guard();
create trigger posts_words before insert or update on public.posts
  for each row execute function app.words_guard();
create trigger comments_words before insert or update on public.comments
  for each row execute function app.words_guard();

-- A flagged word lets the text through and puts it in the moderation queue.
create or replace function app.words_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.flagged_word_in(new.body) then
    insert into public.reports (reporter_id, target_type, target_id, reason, details)
      values (null, case when tg_table_name = 'posts' then 'post' else 'comment' end,
              new.id, 'other', 'Flagged by the word filter');
  end if;
  return null;
end;
$$;
create trigger posts_words_flag after insert or update of body on public.posts
  for each row execute function app.words_flag();
create trigger comments_words_flag after insert or update of body on public.comments
  for each row execute function app.words_flag();

-- ---------------------------------------------------------------- follows

-- A public profile is followed at once; followers-only needs approval; a
-- private profile can't be followed (9.1, 9.7). The follower never chooses.
create or replace function app.follows_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_privacy text;
begin
  if tg_op = 'INSERT' then
    select p.privacy_profile into v_privacy from public.profiles p where p.user_id = new.followee_id;
    if v_privacy = 'private' then
      raise exception 'That profile is private.' using errcode = '42501';
    end if;
    new.status := case when v_privacy = 'public' then 'accepted' else 'pending' end;
    if app.acting_as_player() and not app.take_rate('follow', new.follower_id::text) then
      raise exception 'rate_limited: follow' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  end if;
  return new;
end;
$$;
create trigger follows_guard before insert on public.follows
  for each row execute function app.follows_guard();

-- A block removes any follow between the two, both ways.
create or replace function app.blocks_undo_follows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows f
    where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
       or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  return null;
end;
$$;
create trigger blocks_undo_follows after insert on public.blocks
  for each row execute function app.blocks_undo_follows();

-- ------------------------------------------------------- posts and comments

create or replace function app.posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  if tg_op = 'INSERT' and app.acting_as_player()
     and not app.take_rate('post', new.author_id::text) then
    raise exception 'rate_limited: post' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;
create trigger posts_guard before insert or update on public.posts
  for each row execute function app.posts_guard();

-- One level of replies (9.2), on the same post.
create or replace function app.comments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.comments c
    where c.id = new.parent_id and c.post_id = new.post_id and c.parent_id is null
  ) then
    raise exception 'A reply must answer a comment on the same post, one level deep.'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  if tg_op = 'INSERT' and app.acting_as_player()
     and not app.take_rate('comment', new.author_id::text) then
    raise exception 'rate_limited: comment' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;
create trigger comments_guard before insert or update on public.comments
  for each row execute function app.comments_guard();

create or replace function app.rate_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := tg_argv[0];
  v_subject text;
begin
  if not app.acting_as_player() then
    return new;
  end if;
  v_subject := (to_jsonb(new) ->> tg_argv[1]);
  if not app.take_rate(v_action, v_subject) then
    raise exception 'rate_limited: %', v_action using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;
create trigger likes_rate before insert on public.likes
  for each row execute function app.rate_guard('like', 'user_id');
create trigger reports_rate before insert on public.reports
  for each row execute function app.rate_guard('report', 'reporter_id');
create trigger groups_rate before insert on public.groups
  for each row execute function app.rate_guard('group_create', 'owner_id');

-- ------------------------------------------------------------------ groups

-- The owner is the first member.
create or replace function app.groups_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return null;
end;
$$;
create trigger groups_add_owner after insert on public.groups
  for each row execute function app.groups_add_owner();

-- ------------------------------------------------------------------ photos

-- A photo's check result comes from the server's image check only.
create or replace function app.photo_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.acting_as_player() and new.moderation_status <> 'pending'
     and (tg_op = 'INSERT' or new.moderation_status is distinct from old.moderation_status) then
    raise exception 'Only the image check sets a photo''s status.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger post_photos_status before insert or update on public.post_photos
  for each row execute function app.photo_status_guard();
create trigger farm_showcase_photos_status before insert or update on public.farm_showcase_photos
  for each row execute function app.photo_status_guard();

grant execute on all functions in schema app to anon, authenticated, service_role;
