-- m3.1 Database, second pass (security review): guards for photos, the
-- append-only action log, the audit log, push hosts and deleting an account.

-- ---------------------------------------------- photos: approve the file

-- A path is not an identity. The image check approves one exact file: when
-- a row is set to 'approved' this finds the file by bucket and path, refuses
-- if it is not there yet, and records its storage id and change time. Any
-- change of path sends the row back to unchecked. The read rules on Storage
-- match on that id and time (app.photo_file_visible), and the trigger on
-- storage.objects below sends a row back to pending when its file changes.
-- Arguments: bucket, path column, status column, id column, file-time column,
-- checked-at column.
create or replace function app.photo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text := tg_argv[0];
  pc text := tg_argv[1];
  sc text := tg_argv[2];
  ic text := tg_argv[3];
  uc text := tg_argv[4];
  cc text := tg_argv[5];
  j jsonb := to_jsonb(new);
  v_old jsonb;
  v_path text := j ->> pc;
  v_status text := j ->> sc;
  v_id uuid;
  v_updated timestamptz;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    if (v_old ->> pc) is distinct from v_path then
      v_status := case when v_path is null and sc <> 'moderation_status' then 'none' else 'pending' end;
    end if;
  elsif v_status = 'none' and v_path is not null then
    v_status := 'pending';
  end if;

  if v_status = 'approved' then
    if tg_op = 'INSERT' or (v_old ->> sc) is distinct from 'approved' then
      select o.id, o.updated_at into v_id, v_updated
        from storage.objects o where o.bucket_id = v_bucket and o.name = v_path;
      if v_id is null then
        raise exception 'photo_file_missing: there is no file at % to approve', v_path
          using errcode = 'P0001', hint = 'photo_file_missing';
      end if;
      j := j || jsonb_build_object(sc, v_status, ic, v_id, uc, v_updated, cc, now());
    end if;
  else
    j := j || jsonb_build_object(sc, v_status, ic, null, uc, null);
  end if;
  new := jsonb_populate_record(new, j);
  return new;
end;
$$;
-- Named to run after the other checks on each table.
create trigger zz_profiles_avatar_check before insert or update on public.profiles
  for each row execute function app.photo_guard(
    'avatars', 'avatar_path', 'avatar_status', 'avatar_object_id', 'avatar_object_updated_at', 'avatar_checked_at');
create trigger zz_groups_photo_check before insert or update on public.groups
  for each row execute function app.photo_guard(
    'group-photos', 'photo_path', 'photo_status', 'photo_object_id', 'photo_object_updated_at', 'photo_checked_at');
create trigger zz_post_photos_check before insert or update on public.post_photos
  for each row execute function app.photo_guard(
    'post-photos', 'storage_path', 'moderation_status', 'storage_object_id', 'storage_object_updated_at', 'checked_at');
create trigger zz_farm_showcase_photos_check before insert or update on public.farm_showcase_photos
  for each row execute function app.photo_guard(
    'post-photos', 'storage_path', 'moderation_status', 'storage_object_id', 'storage_object_updated_at', 'checked_at');

-- Any file added, changed or removed at a path a row points at sends that row
-- back to pending, so a swapped file is never shown under an old approval.
create or replace function app.photo_rows_back_to_pending(p_bucket text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_bucket = 'avatars' then
    update public.profiles set avatar_status = 'pending'
      where avatar_path = p_name and avatar_status <> 'pending';
  elsif p_bucket = 'group-photos' then
    update public.groups set photo_status = 'pending'
      where photo_path = p_name and photo_status <> 'pending';
  elsif p_bucket = 'post-photos' then
    update public.post_photos set moderation_status = 'pending'
      where storage_path = p_name and moderation_status <> 'pending';
    update public.farm_showcase_photos set moderation_status = 'pending'
      where storage_path = p_name and moderation_status <> 'pending';
  end if;
end;
$$;

create or replace function app.storage_file_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.photo_rows_back_to_pending(old.bucket_id, old.name);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform app.photo_rows_back_to_pending(new.bucket_id, new.name);
  end if;
  return null;
end;
$$;

-- If the migration role may not add a trigger to Storage's table on some
-- project, the read rules (which match the file's id and change time) still
-- keep a swapped file hidden; the warning says the trigger is missing.
do $$
begin
  create trigger gg_photo_file_changed after insert or update or delete on storage.objects
    for each row execute function app.storage_file_changed();
exception when insufficient_privilege then
  raise warning 'Could not add gg_photo_file_changed to storage.objects: %', sqlerrm;
end;
$$;

-- ------------------------------------------------------ append-only logs

-- The action log is append only, for the server too. A farm being removed
-- (its account deleted, a guest pruned) takes its log with it: that delete
-- comes through the foreign key, one trigger deeper.
create or replace function app.farm_actions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'The action log can not be changed or deleted.' using errcode = '42501';
end;
$$;
create trigger farm_actions_append_only before update or delete on public.farm_actions
  for each row execute function app.farm_actions_append_only();

-- The audit log holds ids and action names, never personal details.
create or replace function app.audit_log_no_personal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.details::text ~* '[^@\s"]+@[^@\s"]+\.[a-z]{2,}' then
    raise exception 'The audit log takes ids and action names only, never an email address.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger admin_audit_log_no_personal before insert on public.admin_audit_log
  for each row execute function app.audit_log_no_personal();

-- ------------------------------------------------------------ push hosts

-- A subscription must point at a known web push service (push_service_hosts).
create or replace function app.push_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text := lower(substring(new.endpoint from '^https://([^/:?#@]+)(:443)?/'));
begin
  if v_host is null or not exists (
    select 1 from public.push_service_hosts h
    where h.host = v_host or (h.include_subdomains and v_host like '%.' || h.host)
  ) then
    raise exception 'push_host_not_allowed: % is not a known web push service', coalesce(v_host, 'that address')
      using errcode = 'P0001', hint = 'push_host_not_allowed';
  end if;
  return new;
end;
$$;
create trigger push_subscriptions_host before insert or update of endpoint on public.push_subscriptions
  for each row execute function app.push_guard();

-- ------------------------------------------------- deleting an account

create or replace function app.email_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(pg_catalog.sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex')
$$;

-- Runs as the Auth user is deleted, before the cascades:
--   * each group the player owns goes to its longest-standing other member
--     (a community member first); a group goes only when they are its only member;
--   * what they wrote in reports is cleared (the reporter is already cleared);
--   * a ban or suspension still running leaves a record with only a hash of
--     the sign-in email, so the same email can't sign up again until it ends.
create or replace function app.before_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  v_new uuid;
  v_banned timestamptz;
  v_until timestamptz;
begin
  for g in select id from public.groups where owner_id = old.id loop
    v_new := null;
    select m.user_id into v_new from public.group_members m
      where m.group_id = g.id and m.user_id <> old.id
      order by app.is_member(m.user_id) desc, m.joined_at, m.user_id
      limit 1;
    if v_new is not null then
      update public.group_members set role = 'member' where group_id = g.id and role = 'owner';
      update public.group_members set role = 'owner' where group_id = g.id and user_id = v_new;
      update public.groups set owner_id = v_new where id = g.id;
    end if;
  end loop;

  update public.reports set details = null where reporter_id = old.id;

  select s.banned_at, s.suspended_until into v_banned, v_until
    from public.account_status s where s.user_id = old.id;
  if old.email is not null and (v_banned is not null or v_until > now()) then
    insert into public.ban_records (email_hash, banned_until)
      values (app.email_hash(old.email), case when v_banned is not null then null else v_until end);
  end if;
  return old;
end;
$$;
create trigger gg_before_account_delete before delete on auth.users
  for each row execute function app.before_account_delete();
