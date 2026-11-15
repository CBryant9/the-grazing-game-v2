-- m6 join: the notifications sender as a pg_cron job, the database-scheduler option beside
-- Vercel's cron, exactly as 20261115000600_daily_cron.sql does for the Daily Farm rollover.
--
-- Two ways to run the sender (docs/DATABASE.md), and either alone is enough:
--   1. Vercel's cron (apps/web/vercel.json), every 5 minutes, which needs a Vercel plan that
--      allows a cron that often. Needs CRON_SECRET in Vercel. Nothing in the database.
--   2. This job. pg_cron calls /api/notify/send through Supabase's pg_net extension with the
--      site's address and the same secret from Supabase Vault: the same two secrets the rollover
--      job reads (gg_site_url, gg_cron_secret), stored once by hand. Until they are there the job
--      does nothing and says nothing.
--
-- Run both and the sender is called twice a run: harmless, since it claims each row once
-- (`for update skip locked`) and every notification has its own dedupe key.
--
-- To turn it off: select cron.unschedule('gg-notify-send');

create or replace function public.notify_send_ping()
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
    using rtrim(v_url, '/') || '/api/notify/send',
          jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  return v_id;
end;
$$;

revoke execute on function public.notify_send_ping() from public, anon, authenticated;
grant execute on function public.notify_send_ping() to service_role;

select cron.schedule(
  'gg-notify-send',
  '*/5 * * * *',
  $$select public.notify_send_ping()$$
);
