-- m3.4 Notifications: the send queue, two more web push hosts, and small additions to the inbox.
--
-- 1. Chrome and Edge push hosts, each with the vendor page it was read from (docs/DATA.md).
-- 2. `notifications.dedupe_key`: one row per event, so a retried queue call never doubles a
--    notification. `notifications.show_in_inbox`: false for a row that only records that a
--    reminder was held or dropped (so the scheduler does not try it again) and is not shown.
-- 3. `notification_prefs` may now hold a row for `system` (account and purchase notices).
-- 4. `notification_sends`: one row per notification and channel (push or email). Server only.
--    It carries the state (pending, sending, sent, failed, held, dropped), the attempts, when to
--    try next, and a fixed reason code. Never a name, an address or text.

insert into public.push_service_hosts (host, include_subdomains, source_url) values
  ('fcm.googleapis.com', false, 'https://developer.chrome.com/blog/web-push-interop-wins'),
  ('notify.windows.com', true,
    'https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview')
on conflict (host) do nothing;

alter table public.notifications
  add column dedupe_key text check (char_length(dedupe_key) between 1 and 120),
  add column show_in_inbox boolean not null default true;
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notification_prefs drop constraint notification_prefs_kind_check;
alter table public.notification_prefs add constraint notification_prefs_kind_check check (
  kind in ('morning_reminder', 'later_nudge', 'farm_alert', 'evening_warning', 'social', 'challenge', 'system')
);

create table public.notification_sends (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  state text not null default 'pending'
    check (state in ('pending', 'sending', 'sent', 'failed', 'held', 'dropped')),
  attempts smallint not null default 0 check (attempts >= 0),
  -- The next attempt, or when a held notification may go.
  not_before timestamptz not null default now(),
  claimed_at timestamptz,
  -- A fixed code (quiet_hours, daily_cap, push_gone, push_rejected, ...). Never text from a person.
  reason text check (reason ~ '^[a-z0-9_]{1,40}$'),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);
alter table public.notification_sends enable row level security;
create index notification_sends_due on public.notification_sends (not_before)
  where state in ('pending', 'held', 'sending');
create index notification_sends_user_sent on public.notification_sends (user_id, sent_at)
  where state = 'sent';
create index notification_sends_recent on public.notification_sends (created_at desc);
create trigger notification_sends_touch before update on public.notification_sends
  for each row execute function app.touch_updated_at();
