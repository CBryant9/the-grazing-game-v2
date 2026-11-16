-- m5.1 Ad slots: what the in-house ad system needs on top of m3.1's tables (PRD 10.1, 11.4).
--
-- Nothing here is reachable by the browser roles: every table below is server only (the rules in
-- 20261114000800_access_rules.sql give admins a read and the server the writes), and the new
-- columns sit on those same tables.

-- A creative can be switched off by itself (a disabled creative never shows and its link no
-- longer redirects). `alt` is the text a screen reader hears for an image. `media_mime` is the
-- type the server found by looking at the bytes of the upload, never the file name.
alter table public.ad_creatives
  add column active boolean not null default true,
  add column alt text check (char_length(alt) <= 120),
  add column media_mime text check (
    media_mime in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')
  ),
  add column media_bytes integer check (media_bytes > 0),
  add constraint ad_creatives_media_kind check (
    media_path is null or (media_mime is not null and kind in ('image', 'video', 'logo'))
  );

-- A campaign can also stop after a number of views in all (a budget), as well as by its dates.
alter table public.campaigns
  add column max_views integer check (max_views > 0);

-- One counted event per impression. The server makes an impression id when it chooses an ad and
-- signs it; the browser sends it back with the event. A replayed beacon carries the same id and
-- hits this index, so it is counted once. `impression_id` is a random id for one showing: it says
-- nothing about the player.
alter table public.ad_events
  add column impression_id uuid;
create unique index ad_events_once on public.ad_events (impression_id, kind)
  where impression_id is not null;

-- Rate limits on ad events (PRD 17), as rows so Claudia can change them. A subject is an account
-- id, a guest session or a hashed address that the server worked out, never one the caller chose.
insert into public.rate_limit_rules (action, max_count, window_seconds, new_account_max, new_account_days) values
  ('ad_view', 300, 3600, null, 0),
  ('ad_click', 60, 3600, null, 0)
on conflict (action) do nothing;
