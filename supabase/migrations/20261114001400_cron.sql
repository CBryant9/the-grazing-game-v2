-- m3.1 Database: scheduled jobs that need only the database (pg_cron).
--
-- The Daily Farm rollover itself needs the engine, which runs on the web
-- server, so it is not here: a scheduled call to the server's rollover route
-- every 15 minutes is set up in milestone 3.3 (BUILD_PLAN 8: a random secret
-- for the rollover job). That route uses daily_claim_due() and daily_finish().
--
-- pg_cron runs in UTC. 14:15 UTC is 1:15 am in Sydney in summer (AEDT) and
-- 12:15 am in winter (AEST): after midnight either way.

do $$
begin
  -- On Supabase this enables the extension. Where a `cron` schema already
  -- exists (the test stand-in), it is left alone.
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    create extension if not exists pg_cron;
  end if;
end;
$$;

select cron.schedule(
  'gg-rollup-ad-events',
  '15 14 * * *',
  $$select public.rollup_ad_events((now() at time zone 'Australia/Sydney')::date - 1)$$
);

select cron.schedule(
  'gg-housekeeping',
  '45 14 * * *',
  $$select public.prune_housekeeping()$$
);
