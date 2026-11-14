-- m3.1 Database: accounts, profiles and guests (PRD 8, 9.1, 15).
--
-- An account is a row in auth.users (Supabase Auth). What we keep about it is
-- split by who may read it:
--   profiles          what other players may see, subject to privacy (9.1)
--   account_private   only the player and the server: date of birth, settings
--   account_status    only the player, admins and the server: role, bans
-- Email lives only in auth.users, which the browser roles can never read.

create table public.account_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'moderator', 'admin')),
  suspended_until timestamptz,
  banned_at timestamptz,
  ban_reason text check (char_length(ban_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_status enable row level security;
create index account_status_staff on public.account_status (role) where role <> 'player';
create trigger account_status_touch before update on public.account_status
  for each row execute function app.touch_updated_at();

create table public.account_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Asked once at sign-up, never shown to anyone else (PRD 8.2). Only the
  -- server can change it (a support request), never the player.
  date_of_birth date not null check (date_of_birth >= date '1900-01-01'),
  -- The viewer's own choice to hide the activity ticker (9.4).
  hide_ticker boolean not null default false,
  marketing_opt_in boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_private enable row level security;
create trigger account_private_touch before update on public.account_private
  for each row execute function app.touch_updated_at();

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) between 1 and 50),
  -- A path in the `avatars` storage bucket, never an outside address.
  avatar_path text check (char_length(avatar_path) <= 300),
  bio text check (char_length(bio) <= 500),
  town text check (char_length(town) <= 60),
  district text check (district in ('cq', 'nsw', 'cw', 'wv')),
  state text check (state in ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  -- Optional farming questions (8.2).
  farms boolean,
  enterprise text check (char_length(enterprise) <= 60),
  farm_size_band text check (
    farm_size_band in ('under_100', '100_500', '500_2000', '2000_10000', 'over_10000')
  ),
  farm_size_ha numeric(10, 1) check (farm_size_ha > 0),
  real_farm_name text check (char_length(real_farm_name) <= 80),
  years_farming integer check (years_farming between 0 and 90),
  farm_role text check (char_length(farm_role) <= 60),
  -- Privacy (9.1).
  privacy_profile text not null default 'public'
    check (privacy_profile in ('public', 'followers', 'private')),
  privacy_farm_view text not null default 'followers'
    check (privacy_farm_view in ('public', 'followers', 'off')),
  ticker_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create unique index profiles_username_lower on public.profiles (lower(username));
create index profiles_district on public.profiles (district);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Profile extras (9.1). Seen by whoever may see the profile.
create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  kind text not null check (kind in ('website', 'instagram', 'facebook', 'x', 'youtube', 'tiktok')),
  url text not null check (url ~ '^https://' and char_length(url) <= 300),
  position smallint not null default 0 check (position between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);
alter table public.profile_links enable row level security;
create trigger profile_links_touch before update on public.profile_links
  for each row execute function app.touch_updated_at();

create table public.profile_experience (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null check (char_length(role) between 1 and 80),
  enterprise text check (char_length(enterprise) <= 80),
  place text check (char_length(place) <= 80),
  from_year smallint check (from_year between 1930 and 2100),
  to_year smallint check (to_year between 1930 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_year is null or from_year is null or to_year >= from_year)
);
alter table public.profile_experience enable row level security;
create index profile_experience_user on public.profile_experience (user_id);
create trigger profile_experience_touch before update on public.profile_experience
  for each row execute function app.touch_updated_at();

create table public.profile_education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  course_name text not null check (char_length(course_name) between 1 and 120),
  provider text check (char_length(provider) <= 120),
  year smallint check (year between 1930 and 2100),
  -- Set by the server only (a course provider confirms it, later).
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_education enable row level security;
create index profile_education_user on public.profile_education (user_id);
create trigger profile_education_touch before update on public.profile_education
  for each row execute function app.touch_updated_at();

create table public.farm_showcase_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 300),
  caption text check (char_length(caption) <= 200),
  position smallint not null default 0 check (position between 0 and 20),
  -- A photo never shows to anyone else before it has been checked (BUILD_PLAN 4.3).
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.farm_showcase_photos enable row level security;
create index farm_showcase_photos_user on public.farm_showcase_photos (user_id);
create trigger farm_showcase_photos_touch before update on public.farm_showcase_photos
  for each row execute function app.touch_updated_at();

-- Guests (PRD 8.1, 5.16): a guest plays through a session the server makes.
-- The browser holds a random secret in a cookie; only its SHA-256 is kept.
-- Guests never talk to the database themselves: the server does it all.
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  last_seen_at timestamptz not null default now(),
  converted_to uuid references auth.users (id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- converted_to goes back to null if that account is later deleted; the date stays.
  check (converted_to is null or converted_at is not null)
);
alter table public.guest_sessions enable row level security;
create index guest_sessions_last_seen on public.guest_sessions (last_seen_at);
create trigger guest_sessions_touch before update on public.guest_sessions
  for each row execute function app.touch_updated_at();

-- Farms each kind of account may have going at once (PRD 5.5). Kept as rows
-- so the limits can change without a release. Must match FARM_LIMITS in
-- packages/shared (a test checks).
create table public.farm_limits (
  tier text not null check (tier in ('guest', 'free', 'pack')),
  mode text not null check (mode in ('daily', 'fast')),
  max_active smallint not null check (max_active between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tier, mode)
);
alter table public.farm_limits enable row level security;
create trigger farm_limits_touch before update on public.farm_limits
  for each row execute function app.touch_updated_at();
