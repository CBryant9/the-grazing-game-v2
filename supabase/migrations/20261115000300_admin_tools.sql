-- m3.5 Admin shell: what the database itself keeps true for the admin screens.
--
-- 1. The last admin can not lose the role. Whoever writes (the server, a person in the SQL
--    editor), an update that would leave no admin is refused. Making an admin is never refused.
-- 2. `admin_sign_out_everywhere`: ends every session of an account (an admin's "sign out
--    everywhere" on a user page). It is a function, not a statement the server runs, because
--    sessions live in Supabase's own `auth` schema, where only the database owner may delete,
--    and because it writes its audit row in the same step: the sessions go only if the row is written.

create or replace function app.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and new.role <> 'admin' then
    -- Lock the admin rows, so two demotions at once can not both see "another admin is left".
    perform 1 from public.account_status s where s.role = 'admin' for update;
    if not exists (
      select 1 from public.account_status s where s.role = 'admin' and s.user_id <> old.user_id
    ) then
      raise exception 'The last admin can not lose the admin role.'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;
  return new;
end;
$$;
create trigger account_status_keep_one_admin before update of role on public.account_status
  for each row execute function app.keep_one_admin();

create or replace function public.admin_sign_out_everywhere(p_admin uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not app.is_admin_user(p_admin) then
    raise exception 'Only an admin can sign an account out.' using errcode = '42501';
  end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id)
    values (p_admin, 'user_sign_out_all', 'account', p_user::text);
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.admin_sign_out_everywhere(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_sign_out_everywhere(uuid, uuid) to service_role;
revoke execute on function app.keep_one_admin() from public, anon, authenticated;
grant execute on function app.keep_one_admin() to service_role;
