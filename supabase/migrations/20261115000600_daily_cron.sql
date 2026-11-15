-- m3.3 second pass: the Daily Farm rollover as a real pg_cron job, as the second way to run it.
--
-- Two ways to run the rollover (docs/DATABASE.md), and either alone is enough:
--   1. Vercel's cron (apps/web/vercel.json), every 15 minutes, which needs a Vercel plan that
--      allows a cron that often. Needs CRON_SECRET in Vercel. Nothing in the database.
--   2. This job. pg_cron calls the site through Supabase's pg_net extension. It needs the site's
--      address and the same secret in Supabase Vault, stored by hand (below), because they are
--      not for the repo. Until they are there the job does nothing and says nothing.
--
-- Run both and the route is called twice a run: harmless, since a farm is claimed by one run only.
--
-- To turn it on, once, in the SQL editor (pg_net and Vault are Supabase extensions, on in the
-- dashboard under Database, Extensions):
--   select vault.create_secret('https://<your site address>', 'gg_site_url');
--   select vault.create_secret('<the same CRON_SECRET as Vercel>', 'gg_cron_secret');
-- To turn it off: select cron.unschedule('gg-daily-rollover');

create or replace function public.daily_rollover_ping()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  -- Where pg_net or Vault is not there (a local database, a project without them) there is
  -- nothing to call, and that is not an error.
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_url using 'gg_site_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_secret using 'gg_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, timeout_milliseconds := 30000)'
    into v_id
    using rtrim(v_url, '/') || '/api/daily/rollover',
          jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  return v_id;
end;
$$;

revoke execute on function public.daily_rollover_ping() from public, anon, authenticated;
grant execute on function public.daily_rollover_ping() to service_role;

select cron.schedule(
  'gg-daily-rollover',
  '*/15 * * * *',
  $$select public.daily_rollover_ping()$$
);
