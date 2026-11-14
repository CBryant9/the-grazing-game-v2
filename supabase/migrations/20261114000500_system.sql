-- m3.1 Database: switches, settings, audit log, rate limits, notifications,
-- the weather and price cache, and exact counts (PRD 11.7, 11.8, 12, 13, 17, 5.14).

-- Feature switches (11.7). The keys are FEATURE_SWITCHES and the ad slot
-- switches are AD_SLOTS, both in packages/shared (a test checks they match).
create table public.feature_switches (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null default false,
  -- Admin's own note. Not sent to the browser (column grants leave it out).
  note text check (char_length(note) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.feature_switches enable row level security;
create trigger feature_switches_touch before update on public.feature_switches
  for each row execute function app.touch_updated_at();

-- Site settings (11.8): announcement bar, districts available, rules text.
-- Only rows marked public are readable by the browser.
create table public.site_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function app.touch_updated_at();

-- Every admin action (11.8). Append only: no one can change or remove a row,
-- not even the server (trigger below).
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text check (char_length(target_type) <= 40),
  target_id text check (char_length(target_id) <= 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
create index admin_audit_log_recent on public.admin_audit_log (created_at desc);

create or replace function app.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Deleting the admin's account sets admin_id to null. That is the one change allowed.
  if tg_op = 'UPDATE'
     and new.admin_id is null
     and old.admin_id is not null
     and (to_jsonb(new) - 'admin_id') = (to_jsonb(old) - 'admin_id') then
    return new;
  end if;
  raise exception 'The audit log can not be changed or deleted.' using errcode = '42501';
end;
$$;
create trigger admin_audit_log_append_only before update or delete on public.admin_audit_log
  for each row execute function app.audit_log_append_only();

-- Rate limits (17, 9.9). The rules are rows so Claudia can change them.
-- new_account_max applies for the first new_account_days of an account.
create table public.rate_limit_rules (
  action text primary key check (action ~ '^[a-z][a-z0-9_]{1,40}$'),
  max_count integer not null check (max_count > 0),
  window_seconds integer not null check (window_seconds > 0),
  new_account_max integer check (new_account_max > 0),
  new_account_days smallint not null default 7 check (new_account_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rate_limit_rules enable row level security;
create trigger rate_limit_rules_touch before update on public.rate_limit_rules
  for each row execute function app.touch_updated_at();

-- Counts in the current window, per subject (an account id, or a key the
-- server works out, never one the caller chose: LESSONS F1).
create table public.rate_limit_hits (
  action text not null references public.rate_limit_rules (action) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 100),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (action, subject, window_start)
);
alter table public.rate_limit_hits enable row level security;
create index rate_limit_hits_old on public.rate_limit_hits (window_start);

-- The in-app inbox (13). Written by the server.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (
    kind in ('morning_reminder', 'later_nudge', 'farm_alert', 'evening_warning', 'social', 'challenge', 'system')
  ),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 500),
  link text check (link ~ '^/' and char_length(link) <= 300),
  farm_id uuid references public.farms (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
create trigger notifications_touch before update on public.notifications
  for each row execute function app.touch_updated_at();

-- One row per account: when the reminders come and the quiet hours (13, 21 row 31).
create table public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reminder_time time not null default '07:00',
  later_nudge boolean not null default true,
  quiet_start time,
  quiet_end time,
  -- For the reminder and quiet hours only. A Daily Farm's own clock is farms.timezone.
  timezone text not null default 'Australia/Sydney' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((quiet_start is null) = (quiet_end is null))
);
alter table public.notification_settings enable row level security;
create trigger notification_settings_touch before update on public.notification_settings
  for each row execute function app.touch_updated_at();

-- Each type can be turned off, by channel (13).
create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (
    kind in ('morning_reminder', 'later_nudge', 'farm_alert', 'evening_warning', 'social', 'challenge')
  ),
  push boolean not null default true,
  email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.notification_prefs enable row level security;
create trigger notification_prefs_touch before update on public.notification_prefs
  for each row execute function app.touch_updated_at();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth_secret text not null check (char_length(auth_secret) <= 100),
  device text check (char_length(device) <= 100),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create index push_subscriptions_user on public.push_subscriptions (user_id);
create trigger push_subscriptions_touch before update on public.push_subscriptions
  for each row execute function app.touch_updated_at();

-- Daily weather from SILO and prices from MLA, fetched once a day on the
-- server for Daily Farm (5.14). Engine data: server only.
create table public.weather_daily (
  district text not null check (district in ('cq', 'nsw', 'cw', 'wv')),
  date date not null,
  rain_mm numeric(6, 1) not null check (rain_mm >= 0),
  tmax_c numeric(4, 1),
  tmin_c numeric(4, 1),
  evap_mm numeric(5, 1) check (evap_mm >= 0),
  source text not null default 'SILO' check (source in ('SILO')),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (district, date)
);
alter table public.weather_daily enable row level security;
create trigger weather_daily_touch before update on public.weather_daily
  for each row execute function app.touch_updated_at();

create table public.price_daily (
  indicator text not null check (char_length(indicator) between 1 and 80),
  saleyard text not null default 'national' check (char_length(saleyard) between 1 and 80),
  date date not null,
  cents_per_kg numeric(8, 2) not null check (cents_per_kg >= 0),
  head integer check (head >= 0),
  source text not null default 'MLA' check (source in ('MLA')),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (indicator, saleyard, date)
);
alter table public.price_daily enable row level security;
create trigger price_daily_touch before update on public.price_daily
  for each row execute function app.touch_updated_at();

-- Exact counts for the admin dashboard and sponsor reports (12, 11.1).
-- dims is a short key such as 'mode=daily' or '' for none.
create table public.daily_counts (
  day date not null,
  metric text not null check (metric ~ '^[a-z][a-z0-9_]{1,40}$'),
  dims text not null default '' check (char_length(dims) <= 120),
  count bigint not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, metric, dims)
);
alter table public.daily_counts enable row level security;
create trigger daily_counts_touch before update on public.daily_counts
  for each row execute function app.touch_updated_at();
