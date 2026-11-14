-- m3.1 Database: farms, saves, days, scores, challenges and leaderboards
-- (PRD 5.2, 5.5, 14.3, 14.5, 15, 21a "Saves and versions").
--
-- The simulation runs on the server for both modes (PRD 5.16). The engine's
-- save and the action log are read and written by the server only: the
-- browser roles have no grant on them at all, so not even the owner can read
-- them. The browser gets the view the server builds.

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one of these: an account's farm, or a guest's.
  owner_id uuid references auth.users (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  mode text not null check (mode in ('daily', 'fast')),
  name text not null check (char_length(name) between 1 and 60),
  -- What the player chose at setup, for lists, boards and filters. The full
  -- setup is kept with the save.
  district text not null check (district in ('cq', 'nsw', 'cw', 'wv')),
  size text not null check (size in ('small', 'medium', 'large')),
  size_ha numeric(10, 1) not null check (size_ha > 0),
  enterprise text not null check (enterprise in ('grazing', 'mixed')),
  start_type text not null check (start_type in ('running', 'scratch')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  years text not null default 'real-in-order'
    check (years in ('real-in-order', 'real-random', 'random')),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (char_length(end_reason) <= 200),
  current_day integer not null default 0 check (current_day >= 0),
  game_date date,
  ranked boolean not null default true,
  -- Rescued after game over (10.3): the score stops at the game over.
  continued boolean not null default false,
  rescue_count smallint not null default 0 check (rescue_count >= 0),
  challenge_id uuid,
  -- The engine version the farm runs on (14.3). Daily Farms move to a new one only at rollover.
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  -- Daily Farm clock (5.2). The time zone is an IANA name set from the device
  -- at creation. sim_through is the last local date the server has simulated.
  timezone text check (char_length(timezone) between 1 and 64),
  timezone_changed_at timestamptz,
  sim_through date,
  rollover_claimed_at timestamptz,
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farms_one_owner check ((owner_id is null) <> (guest_session_id is null)),
  constraint farms_daily_needs_account check (mode <> 'daily' or owner_id is not null),
  constraint farms_daily_clock check (
    mode <> 'daily' or (timezone is not null and sim_through is not null)
  ),
  constraint farms_ended check ((status = 'ended') = (ended_at is not null))
);
alter table public.farms enable row level security;
create index farms_owner on public.farms (owner_id, mode, status);
create index farms_guest on public.farms (guest_session_id) where guest_session_id is not null;
create index farms_daily_due on public.farms (sim_through)
  where mode = 'daily' and status = 'active';
create trigger farms_touch before update on public.farms
  for each row execute function app.touch_updated_at();

-- The engine's save: one row per farm, the latest only. Holds what
-- apps/web/server/game/store.ts keeps in a file today (StoredFarm, format 3),
-- with the diary moved out to farm_days.
create table public.farm_saves (
  farm_id uuid primary key references public.farms (id) on delete cascade,
  -- StoredFarm.format: the version of what is kept for a farm.
  stored_format smallint not null check (stored_format >= 1),
  -- SavedFarm.saveFormat and SavedFarm.engineVersion, copied out so the
  -- server can find old saves without reading the blob.
  save_format smallint not null check (save_format >= 1),
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  -- The version of the data tables (prices, weather) the farm was last run on, if any.
  data_version text check (char_length(data_version) <= 40),
  -- StoredFarm.saved: the engine's save. Hidden rules live in here.
  save jsonb not null,
  -- StoredFarm.setup: what the player chose.
  setup jsonb not null,
  -- StoredFarm.version: changes with every change, so a job shown on an older farm is refused.
  farm_version text not null check (char_length(farm_version) between 1 and 64),
  -- StoredFarm.done: the last few act requests, so a repeat gets the same answer.
  done jsonb not null default '[]'::jsonb check (jsonb_typeof(done) = 'array'),
  -- StoredFarm.inboxRead.
  inbox_read integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.farm_saves enable row level security;
create trigger farm_saves_touch before update on public.farm_saves
  for each row execute function app.touch_updated_at();

-- One row per day lived: the diary lines (StoredDiaryDay) and the day's facts
-- (14.4 daylight stored per farm per day, 5.2 daily history).
create table public.farm_days (
  farm_id uuid not null references public.farms (id) on delete cascade,
  day integer not null check (day >= 0),
  game_date date not null,
  lines text[] not null default '{}',
  more integer not null default 0 check (more >= 0),
  first_light time,
  last_light time,
  minutes_used smallint check (minutes_used between 0 and 1440),
  rain_mm numeric(6, 1) check (rain_mm >= 0),
  -- Words and figures to show (grass, gains, deaths and why, money). No formulas.
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (farm_id, day)
);
alter table public.farm_days enable row level security;
create trigger farm_days_touch before update on public.farm_days
  for each row execute function app.touch_updated_at();

-- The map on a past day (5.2), kept small in the `snapshots` storage bucket
-- (BUILD_PLAN 5.2: daily for 90 days, then weekly).
create table public.farm_snapshots (
  farm_id uuid not null references public.farms (id) on delete cascade,
  day integer not null check (day >= 0),
  game_date date not null,
  storage_path text not null check (char_length(storage_path) <= 300),
  bytes integer check (bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (farm_id, day)
);
alter table public.farm_snapshots enable row level security;
create trigger farm_snapshots_touch before update on public.farm_snapshots
  for each row execute function app.touch_updated_at();

-- Every job and skip the server ran, in order (14.5: kept for support and for
-- checking engine changes). Server only.
create table public.farm_actions (
  id bigint generated always as identity primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  seq integer not null check (seq >= 0),
  game_day integer not null check (game_day >= 0),
  request_id text check (char_length(request_id) <= 64),
  action jsonb not null,
  ok boolean not null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, seq)
);
alter table public.farm_actions enable row level security;
create unique index farm_actions_request on public.farm_actions (farm_id, request_id)
  where request_id is not null;
create trigger farm_actions_touch before update on public.farm_actions
  for each row execute function app.touch_updated_at();

-- A farm's scores, written by the server only (9.8, 14.5).
create table public.farm_scores (
  farm_id uuid primary key references public.farms (id) on delete cascade,
  grazier_score numeric(10, 2),
  profit_per_ha numeric(12, 2),
  beef_per_ha numeric(10, 2),
  ground_cover_pct numeric(5, 2) check (ground_cover_pct between 0 and 100),
  deaths_pct numeric(5, 2) check (deaths_pct between 0 and 100),
  days_survived integer not null default 0 check (days_survived >= 0),
  -- Every farm is run by the server, so every score is checked (14.5, v1.1).
  verified boolean not null default true,
  verified_at timestamptz,
  -- A rescued farm's score stops at the game over (10.3).
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.farm_scores enable row level security;
create trigger farm_scores_touch before update on public.farm_scores
  for each row execute function app.touch_updated_at();

-- Fast Farm challenges and Daily leagues (9.6, 11.6). Public when group_id is null.
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fast_challenge', 'daily_league')),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 1000),
  district text check (district in ('cq', 'nsw', 'cw', 'wv')),
  -- The farm settings everyone starts with. Shown to players.
  settings jsonb not null default '{}'::jsonb,
  -- The farm's seed. Never sent to the browser (column grants leave it out).
  seed bigint not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  group_id uuid,
  sponsor_campaign_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
alter table public.challenges enable row level security;
create index challenges_group on public.challenges (group_id);
create index challenges_starts on public.challenges (starts_at);
create trigger challenges_touch before update on public.challenges
  for each row execute function app.touch_updated_at();

alter table public.farms
  add constraint farms_challenge_fk foreign key (challenge_id)
  references public.challenges (id) on delete set null;

create table public.challenge_entries (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  farm_id uuid not null unique references public.farms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, farm_id)
);
alter table public.challenge_entries enable row level security;
create index challenge_entries_user on public.challenge_entries (user_id);
create trigger challenge_entries_touch before update on public.challenge_entries
  for each row execute function app.touch_updated_at();

-- Leaderboard rows (9.8, 14.5, 5.14 "a board for each real year"). Written by
-- the server only. When an account is deleted its rows stay, with no
-- account or farm (21a "Your data": leaderboard entries are anonymised).
create table public.leaderboard_entries (
  id bigint generated always as identity primary key,
  farm_id uuid references public.farms (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  board text not null check (
    board in ('grazier', 'profit_per_ha', 'beef_per_ha', 'ground_cover', 'days_survived', 'real_year')
  ),
  mode text not null check (mode in ('daily', 'fast')),
  district text not null check (district in ('cq', 'nsw', 'cw', 'wv')),
  size text not null check (size in ('small', 'medium', 'large')),
  start_type text not null check (start_type in ('running', 'scratch')),
  enterprise text not null check (enterprise in ('grazing', 'mixed')),
  -- week '2026-W46', month '2026-11', season '2026-spring', all 'all'.
  period text not null check (period in ('week', 'month', 'season', 'all')),
  period_key text not null check (char_length(period_key) between 1 and 20),
  -- Only on the real-year board: the real year played, ranked on the change over that year.
  real_year smallint check (real_year between 1997 and 2100),
  challenge_id uuid references public.challenges (id) on delete cascade,
  score numeric(14, 2) not null,
  days integer not null default 0 check (days >= 0),
  continued boolean not null default false,
  farm_name text not null check (char_length(farm_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((board = 'real_year') = (real_year is not null))
);
alter table public.leaderboard_entries enable row level security;
create unique index leaderboard_entries_one on public.leaderboard_entries
  (farm_id, board, period_key, real_year, challenge_id) nulls not distinct
  where farm_id is not null;
create index leaderboard_entries_board on public.leaderboard_entries
  (board, period_key, mode, district, score desc);
create index leaderboard_entries_user on public.leaderboard_entries (user_id);
create trigger leaderboard_entries_touch before update on public.leaderboard_entries
  for each row execute function app.touch_updated_at();
