-- m5.3 Dashboard and analytics (PRD 11.1, 12, 14.10).
--
-- Every table here is server only: no grant for the browser roles. The admin dashboard reads
-- them through the server. None holds a person's data beyond the consent choice: the counts are
-- small aggregate rows (a day, a fixed name, a count), never one row per request or per person.
--
-- 1. `analytics_consent`: an account's yes or no to analytics. No row means no. A yes is refused
--    for an account under 16 by the trigger below, whatever the server asks.
-- 2. `analytics_daily`: event counts by day, event name and a fixed property key.
-- 3. `web_vitals_daily`: Web Vitals as a histogram by day, page, metric and bucket, so the
--    dashboard works out the 75th percentile without keeping any single reading.
-- 4. `health_daily`: game health: route timings, failures by reason code, save conflicts and
--    rollover runs, as counts with a total and a longest time.
-- 5. The `analytics` feature switch, off.

create table public.analytics_consent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted boolean not null default false,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.analytics_consent enable row level security;
create trigger analytics_consent_touch before update on public.analytics_consent
  for each row execute function app.touch_updated_at();

-- Under 16 can never say yes. The age is worked out from the date of birth in the database, never
-- from anything the server is sent. An account with no date of birth kept is refused too.
create or replace function app.analytics_consent_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  dob date;
begin
  if new.granted then
    select a.date_of_birth into dob from public.account_private a where a.user_id = new.user_id;
    if dob is null or app.age_on(dob, app.today_sydney()) < 16 then
      raise exception 'Analytics can not be turned on for this account.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function app.analytics_consent_guard() from public, anon, authenticated;
grant execute on function app.analytics_consent_guard() to service_role;
create trigger analytics_consent_guard before insert or update on public.analytics_consent
  for each row execute function app.analytics_consent_guard();

create table public.analytics_daily (
  day date not null,
  event text not null check (event ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- The event's properties as fixed `key=value` pairs joined by `;`, sorted, or '' for none.
  props text not null default '' check (char_length(props) <= 200 and props ~ '^[a-z0-9_=;.-]*$'),
  count bigint not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, event, props)
);
alter table public.analytics_daily enable row level security;
create trigger analytics_daily_touch before update on public.analytics_daily
  for each row execute function app.touch_updated_at();

create table public.web_vitals_daily (
  day date not null,
  page text not null check (page ~ '^[a-z][a-z0-9_]{1,40}$'),
  metric text not null check (metric in ('LCP', 'CLS', 'INP')),
  -- The bucket's upper edge (ms for LCP and INP, CLS times 1000). Edges: server/analytics/vitals.ts.
  bucket integer not null check (bucket >= 0),
  count bigint not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, page, metric, bucket)
);
alter table public.web_vitals_daily enable row level security;
create trigger web_vitals_daily_touch before update on public.web_vitals_daily
  for each row execute function app.touch_updated_at();

create table public.health_daily (
  day date not null,
  kind text not null check (kind in ('route', 'failure', 'save_conflict', 'rollover')),
  route text not null check (route ~ '^[a-z][a-z0-9_-]{0,60}$'),
  -- A fixed reason code (`logging.ts`), or '' for a timing.
  reason text not null default '' check (reason ~ '^[a-z0-9_]{0,48}$'),
  count bigint not null default 0 check (count >= 0),
  total_ms bigint not null default 0 check (total_ms >= 0),
  max_ms integer not null default 0 check (max_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, kind, route, reason)
);
alter table public.health_daily enable row level security;
create trigger health_daily_touch before update on public.health_daily
  for each row execute function app.touch_updated_at();

-- Server only, as every table above. The access rules migration granted the server every table
-- that existed then; these are new, so they are granted here.
revoke all on public.analytics_consent, public.analytics_daily, public.web_vitals_daily,
  public.health_daily from anon, authenticated;
grant select, insert, update, delete on public.analytics_consent, public.analytics_daily,
  public.web_vitals_daily, public.health_daily to service_role;

-- The analytics switch, at its launch default in FEATURE_SWITCHES (packages/shared): off.
insert into public.feature_switches (key, enabled) values
  ('analytics', false)
on conflict (key) do nothing;
