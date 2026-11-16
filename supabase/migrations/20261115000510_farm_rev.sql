-- m3.3 second pass: a revision on every save, so a stale copy is never trusted.
--
-- farm_saves.farm_version changes only when the farm's game state changes (it is what a card on
-- screen was made on). Things the player does that leave the farm alone (the inbox read mark, a
-- Daily Farm's "opened today", "done for today" and the catch-up they have seen) are also stored
-- with the save, and a second server holding an older copy would write them back over the new.
-- rev goes up by one on every write to the save, whatever it changes. The server checks it before it
-- trusts a cached copy, and a write names the rev it was made from, so a write made from an
-- old copy changes nothing and is told so.
--
-- A correction to the comment in 20261115000400: a day's weather row is NOT written with that day's
-- price rows any more. Weather, prices and sale days are kept apart as each arrives, and a night never
-- waits for them (docs/DATABASE.md, "Daily Farm").

alter table public.farm_saves
  add column rev integer not null default 0 check (rev >= 0);
