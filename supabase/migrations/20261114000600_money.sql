-- m3.1 Database: ad slots and campaigns (PRD 10.1, 11.4) and one-off purchases
-- (10.3, 11.5, v1.1 replaces the subscription). We never see or keep card
-- details: Stripe's own page takes the payment.

-- One row per slot in AD_SLOTS (packages/shared). Every slot is off by default.
create table public.ad_slots (
  slot_id text primary key check (slot_id ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null default false,
  -- Frequency caps and the like, for example {"min_seconds_between": 300, "every_n_posts": 8}.
  settings jsonb not null default '{}'::jsonb,
  provider text not null default 'house' check (provider in ('house', 'adsense')),
  adsense_unit_id text check (char_length(adsense_unit_id) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ad_slots enable row level security;
create trigger ad_slots_touch before update on public.ad_slots
  for each row execute function app.touch_updated_at();

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  logo_path text check (char_length(logo_path) <= 300),
  -- Admin only. A person's name or a note, kept off every public page.
  contact text check (char_length(contact) <= 300),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;
create trigger sponsors_touch before update on public.sponsors
  for each row execute function app.touch_updated_at();

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid references public.sponsors (id) on delete cascade,
  -- House ads fill empty slots with Claudia's own businesses (11.4).
  is_house_ad boolean not null default false,
  name text not null check (char_length(name) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- {"audience": "everyone" | "farmers", "states": ["QLD"]}
  targeting jsonb not null default '{}'::jsonb,
  weight smallint not null default 1 check (weight between 1 and 100),
  -- Views a day for one viewer, if capped.
  max_views_per_viewer_day smallint check (max_views_per_viewer_day > 0),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (is_house_ad or sponsor_id is not null)
);
alter table public.campaigns enable row level security;
create index campaigns_live on public.campaigns (starts_at, ends_at) where active;
create trigger campaigns_touch before update on public.campaigns
  for each row execute function app.touch_updated_at();

alter table public.challenges
  add constraint challenges_sponsor_fk foreign key (sponsor_campaign_id)
  references public.campaigns (id) on delete set null;

create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'text', 'logo')),
  headline text check (char_length(headline) <= 80),
  body text check (char_length(body) <= 200),
  link_url text check (link_url ~ '^https://' and char_length(link_url) <= 500),
  -- A path in the `ad-media` storage bucket.
  media_path text check (char_length(media_path) <= 300),
  width smallint check (width > 0),
  height smallint check (height > 0),
  duration_s smallint check (duration_s between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ad_creatives enable row level security;
create index ad_creatives_campaign on public.ad_creatives (campaign_id);
create trigger ad_creatives_touch before update on public.ad_creatives
  for each row execute function app.touch_updated_at();

create table public.campaign_slots (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  slot_id text not null references public.ad_slots (slot_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, slot_id)
);
alter table public.campaign_slots enable row level security;
create index campaign_slots_slot on public.campaign_slots (slot_id);
create trigger campaign_slots_touch before update on public.campaign_slots
  for each row execute function app.touch_updated_at();

-- Every view and click (10.1), rolled up nightly into ad_daily. Raw events
-- older than the roll-up are removed by the nightly job.
create table public.ad_events (
  id bigint generated always as identity primary key,
  slot_id text not null references public.ad_slots (slot_id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  creative_id uuid references public.ad_creatives (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  guest_session_id uuid references public.guest_sessions (id) on delete set null,
  kind text not null check (kind in ('view', 'click', 'video_complete', 'video_skip')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ad_events enable row level security;
create index ad_events_day on public.ad_events (created_at);
-- For frequency caps: a viewer's last views in a slot.
create index ad_events_viewer on public.ad_events (user_id, slot_id, created_at desc)
  where user_id is not null;
create index ad_events_guest on public.ad_events (guest_session_id, slot_id, created_at desc)
  where guest_session_id is not null;

create table public.ad_daily (
  day date not null,
  slot_id text not null references public.ad_slots (slot_id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('view', 'click', 'video_complete', 'video_skip')),
  count bigint not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (day, slot_id, campaign_id, kind)
);
alter table public.ad_daily enable row level security;
create index ad_daily_campaign on public.ad_daily (campaign_id, day);
create trigger ad_daily_touch before update on public.ad_daily
  for each row execute function app.touch_updated_at();

-- What can be bought (10.3). Prices are set in Stripe and here.
create table public.products (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('pack', 'upgrade', 'keep_going')),
  -- The Stripe price id (not a secret). Empty until Claudia makes the products in Stripe.
  stripe_price_id text check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'aud' check (currency = 'aud'),
  -- What it gives, as entitlement keys, for example {"farm_pack", "no_ads"}.
  grants text[] not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create trigger products_touch before update on public.products
  for each row execute function app.touch_updated_at();

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  product_id text not null references public.products (id),
  -- For paying to keep going: the farm rescued.
  farm_id uuid references public.farms (id) on delete set null,
  stripe_checkout_session_id text unique check (char_length(stripe_checkout_session_id) <= 255),
  stripe_payment_intent_id text check (char_length(stripe_payment_intent_id) <= 255),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'aud' check (currency = 'aud'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchases enable row level security;
create index purchases_user on public.purchases (user_id, created_at desc);
create trigger purchases_touch before update on public.purchases
  for each row execute function app.touch_updated_at();

-- What an account owns (10.3): farm_pack (5 of each farm), no_ads, supporter_badge.
create table public.account_entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement text not null check (entitlement in ('farm_pack', 'no_ads', 'supporter_badge', 'full_diary')),
  purchase_id uuid references public.purchases (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement)
);
alter table public.account_entitlements enable row level security;
create trigger account_entitlements_touch before update on public.account_entitlements
  for each row execute function app.touch_updated_at();

create table public.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
create trigger stripe_customers_touch before update on public.stripe_customers
  for each row execute function app.touch_updated_at();

-- Every Stripe webhook event, once (the id makes a repeat a no-op). Only the
-- ids the server needs are kept, never the raw payload: a Checkout event
-- carries the buyer's email and name.
create table public.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null check (char_length(type) <= 100),
  -- The Checkout session (cs_...), payment intent (pi_...) or charge the event is about.
  object_id text check (object_id ~ '^[a-z]{2,6}_[A-Za-z0-9_]+$'),
  stripe_customer_id text check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  payment_intent_id text check (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text check (char_length(error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
create index stripe_events_unprocessed on public.stripe_events (received_at) where processed_at is null;
create trigger stripe_events_touch before update on public.stripe_events
  for each row execute function app.touch_updated_at();
