-- m3.2 Accounts and saves: what the server's farm store needs that 3.1 left out.
-- (A new file after the last one; nothing earlier was changed.)
--
-- 1. farm_saves.missed_wages: StoredFarm.missedWages, the farm days a pay day was missed.
-- 2. farm_snapshot_views: the view of a past day for "see the farm on a past day" (PRD 5.2).
--    farm_snapshots stays the index (day, date); the numbers live here, server only,
--    because they are game data the browser must only get through the server.
-- 3. farm_saves_aside: a save that could not be opened, kept aside ("Start a new farm"
--    never deletes it). Server only. It goes with its owner when an account or
--    guest goes, and is cleared by prune_housekeeping after 30 days.

alter table public.farm_saves
  add column missed_wages integer[] not null default '{}';

create table public.farm_snapshot_views (
  farm_id uuid not null,
  day integer not null check (day >= 0),
  view jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (farm_id, day),
  foreign key (farm_id, day) references public.farm_snapshots (farm_id, day) on delete cascade
);
alter table public.farm_snapshot_views enable row level security;
create trigger farm_snapshot_views_touch before update on public.farm_snapshot_views
  for each row execute function app.touch_updated_at();

create table public.farm_saves_aside (
  id bigint generated always as identity primary key,
  -- No foreign key to farms: the farm row is gone. The owner is kept so the
  -- aside copy goes with the account or the guest.
  farm_id uuid not null,
  owner_id uuid references auth.users (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  stored_format smallint,
  save jsonb,
  setup jsonb,
  reason text check (char_length(reason) <= 200),
  aside_at timestamptz not null default now(),
  constraint farm_saves_aside_one_owner check ((owner_id is null) <> (guest_session_id is null))
);
alter table public.farm_saves_aside enable row level security;
create index farm_saves_aside_owner on public.farm_saves_aside (owner_id);
create index farm_saves_aside_guest on public.farm_saves_aside (guest_session_id);

-- Browser roles get nothing on either new table (Supabase's default grants are
-- taken away, as the earlier migrations do).
revoke all on public.farm_snapshot_views from anon, authenticated;
revoke all on public.farm_saves_aside from anon, authenticated;
grant select, insert, update, delete on public.farm_snapshot_views to service_role;
grant select, insert, update, delete on public.farm_saves_aside to service_role;

-- Housekeeping: also clear aside saves after 30 days. (Replaces the 3.1 function
-- with the same body plus one delete.)
create or replace function public.prune_housekeeping(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limit_hits where window_start < p_now - interval '2 days';
  delete from public.guest_sessions
    where converted_at is null and last_seen_at < p_now - interval '30 days';
  delete from public.farm_saves_aside where aside_at < p_now - interval '30 days';
end;
$$;
