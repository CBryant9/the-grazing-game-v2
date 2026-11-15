-- m3.3 Daily Farm: what the rollover and the Daily Farm saves need that 3.1 and 3.2 left out.
-- (A new file after the last one; nothing earlier was changed.)
--
-- 1. farm_saves.daily: what a Daily Farm keeps beside the engine's save (the local date the
--    player last opened it, days missed and waiting for the catch-up summary, the versions
--    from before each midnight). Server only, like the rest of farm_saves. Null for a Fast Farm.
-- 2. weather_daily.et0_mm and rad_mj: the growth model reads SILO's FAO-56 evapotranspiration
--    (et0), which the table did not have, and radiation completes the six variables the baked
--    tables hold. A day's weather row is only ever written in the same transaction as that
--    day's price rows, so the row being there means the day's data is in (docs/DATABASE.md).
-- 3. Daily Farm is off until Claudia turns it on (the brief for 3.3; PRD 11.7 had it on).
--    packages/shared FEATURE_SWITCHES says the same, and a test checks they match.

alter table public.farm_saves
  add column daily jsonb;

alter table public.weather_daily
  add column et0_mm numeric(5, 1) check (et0_mm >= 0),
  add column rad_mj numeric(5, 1) check (rad_mj >= 0);

update public.feature_switches set enabled = false where key = 'daily_farm';
