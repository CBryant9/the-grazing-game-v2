-- m3.5 second pass (a security review of the admin shell).
--
-- 1. `is_admin_user` and `is_staff` now mean "in good standing". Before, a banned or suspended
--    admin still passed them, and the access rules use them for account_status (with the ban
--    reason), the audit log, private site settings and moderation history, so such an admin could
--    still read them through Supabase's own API with their own token.
-- 2. The last-admin trigger counts only admins in good standing, and also watches bans and
--    suspensions: the SQL editor can no longer ban or suspend the last good admin, and a banned
--    admin is not a second admin.
-- 3. `app.end_sessions(user)`: ends every session of an account. A ban or a suspension calls it in
--    the same transaction. It writes no audit row of its own (the ban or suspension's row says how many).
-- 4. An index that serves the admin username search (prefix, any case).

create or replace function app.is_admin_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_status s
    where s.user_id = p_user
      and s.role = 'admin'
      and s.banned_at is null
      and (s.suspended_until is null or s.suspended_until <= now())
  )
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
    where s.user_id = app.uid()
      and s.role in ('admin', 'moderator')
      and s.banned_at is null
      and (s.suspended_until is null or s.suspended_until <= now())
  )
$$;

create or replace function app.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_good boolean;
  v_new_good boolean;
begin
  v_old_good := old.role = 'admin' and old.banned_at is null
    and (old.suspended_until is null or old.suspended_until <= now());
  v_new_good := new.role = 'admin' and new.banned_at is null
    and (new.suspended_until is null or new.suspended_until <= now());
  if v_old_good and not v_new_good then
    -- Lock the admin rows, so two changes at once can not both see "another admin is left".
    perform 1 from public.account_status s where s.role = 'admin' for update;
    if not exists (
      select 1 from public.account_status s
      where s.role = 'admin' and s.user_id <> old.user_id and s.banned_at is null
        and (s.suspended_until is null or s.suspended_until <= now())
    ) then
      raise exception 'The last admin in good standing can not lose the role or be banned or suspended.'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;
  return new;
end;
$$;
drop trigger account_status_keep_one_admin on public.account_status;
create trigger account_status_keep_one_admin
  before update of role, banned_at, suspended_until on public.account_status
  for each row execute function app.keep_one_admin();

create or replace function app.end_sessions(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function app.end_sessions(uuid) from public, anon, authenticated;
grant execute on function app.end_sessions(uuid) to service_role;

create index profiles_username_prefix on public.profiles (lower(username) text_pattern_ops);
