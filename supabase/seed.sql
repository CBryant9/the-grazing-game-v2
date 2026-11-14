-- Seed data for local development, previews and the database tests
-- (PRD 21a "Environments"). Never run against production.
--
-- Accounts (no email addresses are kept here; set one in the local Studio to
-- sign in as a seed account):
--   ...000a  gg_admin     admin, adult
--   ...0001  ava_grazier  adult, public profile           (player A in tests)
--   ...0002  ben_paddock  adult, owns the farm pack      (player B in tests)
--   ...0003  kid_cattle   15 years old: no community      (under 16 in tests)
--   ...0004  cara_cropper adult; Ben has blocked her
--   ...000b  gg_moderator moderator, adult
-- The feature switches stay at the launch defaults the reference data sets.
--
-- The sample weather, price and count rows are made-up placeholders for
-- tests, not real figures.

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '{}', '{}', now(), now());

insert into public.profiles (user_id, username, display_name, bio, town, district, state, farms, enterprise,
  farm_size_band, privacy_profile, privacy_farm_view, ticker_opt_in, created_at)
values
  ('00000000-0000-4000-8000-00000000000a', 'gg_admin', 'Game admin', null, null, 'nsw', 'NSW', null, null, null, 'private', 'off', false, now() - interval '60 days'),
  ('00000000-0000-4000-8000-000000000001', 'ava_grazier', 'Ava', 'Breeders on the Tablelands.', 'Armidale', 'nsw', 'NSW', true, 'Beef breeding', '500_2000', 'public', 'public', true, now() - interval '60 days'),
  ('00000000-0000-4000-8000-000000000002', 'ben_paddock', 'Ben', 'Trading steers out west.', 'Dubbo', 'cw', 'NSW', true, 'Steer trading', '2000_10000', 'public', 'followers', true, now() - interval '60 days'),
  ('00000000-0000-4000-8000-000000000003', 'kid_cattle', 'Kid', 'Year 10, helps on the family place.', 'Emerald', 'cq', 'QLD', true, null, null, 'public', 'public', true, now() - interval '60 days'),
  ('00000000-0000-4000-8000-000000000004', 'cara_cropper', 'Cara', 'Wheat and sheep near Hamilton.', 'Hamilton', 'wv', 'VIC', true, 'Mixed farming', '500_2000', 'public', 'public', false, now() - interval '60 days'),
  ('00000000-0000-4000-8000-00000000000b', 'gg_moderator', 'Moderator', null, null, 'nsw', 'NSW', null, null, null, 'private', 'off', false, now() - interval '60 days');

insert into public.account_private (user_id, date_of_birth, terms_accepted_at) values
  ('00000000-0000-4000-8000-00000000000a', '1985-03-01', now()),
  ('00000000-0000-4000-8000-000000000001', '1990-06-15', now()),
  ('00000000-0000-4000-8000-000000000002', '1978-11-02', now()),
  -- Always 15 years and 2 months old, whatever day the seed runs.
  ('00000000-0000-4000-8000-000000000003', ((now() at time zone 'Australia/Sydney')::date - interval '15 years 2 months')::date, now()),
  ('00000000-0000-4000-8000-000000000004', '1995-09-20', now()),
  ('00000000-0000-4000-8000-00000000000b', '1988-01-10', now());

insert into public.account_status (user_id, role) values
  ('00000000-0000-4000-8000-00000000000a', 'admin'),
  ('00000000-0000-4000-8000-000000000001', 'player'),
  ('00000000-0000-4000-8000-000000000002', 'player'),
  ('00000000-0000-4000-8000-000000000003', 'player'),
  ('00000000-0000-4000-8000-000000000004', 'player'),
  ('00000000-0000-4000-8000-00000000000b', 'moderator');

insert into public.profile_links (user_id, kind, url) values
  ('00000000-0000-4000-8000-000000000001', 'website', 'https://example.org/ava');
insert into public.profile_experience (user_id, role, enterprise, place, from_year) values
  ('00000000-0000-4000-8000-000000000001', 'Manager', 'Beef breeding', 'New England', 2012);
insert into public.profile_education (user_id, course_name, provider, year) values
  ('00000000-0000-4000-8000-000000000001', 'Grazing for Profit', 'RCS', 2015);
-- The files the sample photos point at (metadata only; no image is stored).
-- A photo can be approved only once its file is there.
insert into storage.objects (bucket_id, name) values
  ('post-photos', '00000000-0000-4000-8000-000000000001/yards.jpg'),
  ('post-photos', '00000000-0000-4000-8000-000000000001/rain.jpg'),
  ('post-photos', '00000000-0000-4000-8000-000000000001/gauge.jpg'),
  ('avatars', '00000000-0000-4000-8000-000000000001/me.png'),
  ('avatars', '00000000-0000-4000-8000-000000000003/me.png');
update public.profiles set avatar_path = user_id::text || '/me.png'
  where user_id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003');
update public.profiles set avatar_status = 'approved'
  where user_id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003');

insert into public.farm_showcase_photos (user_id, storage_path, caption, moderation_status) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/yards.jpg', 'The yards', 'approved');

-- A guest with one Fast Farm.
insert into public.guest_sessions (id, token_hash) values
  ('00000000-0000-4000-8000-0000000000e1', repeat('ab', 32));

-- What Ben bought: the farm pack, so 5 of each farm.
insert into public.purchases (id, user_id, product_id, stripe_checkout_session_id, amount_cents, status, paid_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000002', 'farm_pack', 'cs_test_seed0001', 3000, 'paid', now() - interval '10 days');
insert into public.account_entitlements (user_id, entitlement, purchase_id) values
  ('00000000-0000-4000-8000-000000000002', 'farm_pack', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-000000000002', 'supporter_badge', '00000000-0000-4000-8000-0000000000c1');
insert into public.stripe_customers (user_id, stripe_customer_id) values
  ('00000000-0000-4000-8000-000000000002', 'cus_TESTseed0001');
insert into public.stripe_events (id, type, object_id, stripe_customer_id, processed_at) values
  ('evt_TESTseed0001', 'checkout.session.completed', 'cs_test_seed0001', 'cus_TESTseed0001', now());

-- Farms. Ava: one Fast, one Daily. Ben: one Fast. Kid: one Fast. The guest: one Fast.
insert into public.farms (id, owner_id, guest_session_id, mode, name, district, size, size_ha, enterprise,
  start_type, difficulty, current_day, engine_version, timezone, sim_through)
values
  ('f0000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', null, 'fast', 'Kooringa', 'nsw', 'medium', 800, 'grazing', 'running', 'medium', 120, '0.12.1', null, null),
  ('f0000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', null, 'daily', 'Glen Innes Road', 'nsw', 'small', 300, 'grazing', 'scratch', 'medium', 12, '0.12.1', 'Australia/Sydney', ((now() at time zone 'Australia/Sydney')::date - 1)),
  ('f0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000002', null, 'fast', 'Red Hill', 'cw', 'large', 3000, 'mixed', 'running', 'hard', 400, '0.12.1', null, null),
  ('f0000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000003', null, 'fast', 'Brigalow', 'cq', 'medium', 1500, 'grazing', 'running', 'easy', 30, '0.12.1', null, null),
  ('f0000000-0000-4000-8000-0000000000d1', null, '00000000-0000-4000-8000-0000000000e1', 'fast', 'Guest farm', 'wv', 'small', 400, 'grazing', 'running', 'easy', 5, '0.12.1', null, null);

insert into public.farm_saves (farm_id, stored_format, save_format, engine_version, save, setup, farm_version)
select f.id, 3, 8, '0.12.1',
  '{"saveFormat": 8, "engineVersion": "0.12.1", "sample": "the engine save, with its hidden rules"}'::jsonb,
  jsonb_build_object('district', f.district, 'size', f.size, 'name', f.name),
  'v1'
from public.farms f;

insert into public.farm_days (farm_id, day, game_date, lines, first_light, last_light, minutes_used, rain_mm)
select f.id, 1, date '2026-11-01', array['Moved Mob 1 to Paddock 3.'], '05:10', '19:20', 75, 0
from public.farms f;

insert into public.farm_snapshots (farm_id, day, game_date, storage_path)
select f.id, 1, date '2026-11-01', f.id::text || '/1.json.gz' from public.farms f;

insert into public.farm_actions (farm_id, seq, game_day, request_id, action, ok)
select f.id, 1, 1, 'req-seed-1', '{"todo": "next_day"}', true from public.farms f;

insert into public.farm_scores (farm_id, grazier_score, profit_per_ha, beef_per_ha, ground_cover_pct, days_survived, verified_at)
select f.id, 50 + f.current_day / 10.0, 20, 80, 70, f.current_day, now() from public.farms f;

-- Community: Ava and Ben follow each other. Ben has blocked Cara.
insert into public.follows (follower_id, followee_id, status) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'accepted'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'accepted');
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004');

insert into public.groups (id, name, description, visibility, owner_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'Tablelands graziers', 'Friends on the Tablelands.', 'private', '00000000-0000-4000-8000-000000000001');
insert into public.group_members (group_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000002', 'member');

-- Posts: Ava's public post, Ben's followers-only post, a day card the server
-- made for Ava, and a post in Ava's group.
insert into public.posts (id, author_id, kind, body, visibility, group_id, farm_id, farm_day, card) values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000001', 'post', 'Good rain overnight, 22 mm in the gauge.', 'public', null, null, null, null),
  ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-000000000002', 'post', 'Weaned the spring drop today.', 'followers', null, null, null, null),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-000000000001', 'day_card', null, 'public', null, 'f0000000-0000-4000-8000-0000000000a2', 12, '{"lines": ["Moved 2 mobs", "12 mm of rain"]}'),
  ('00000000-0000-4000-8000-0000000001a3', '00000000-0000-4000-8000-000000000001', 'post', 'Group: who is joining in March?', 'public', '00000000-0000-4000-8000-0000000000f1', null, null, null);

insert into public.post_photos (id, post_id, storage_path, position, moderation_status) values
  ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000001/rain.jpg', 1, 'approved'),
  ('00000000-0000-4000-8000-0000000003a2', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000001/gauge.jpg', 2, 'pending');

insert into public.comments (id, post_id, author_id, body) values
  ('00000000-0000-4000-8000-0000000004b1', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000002', 'We got 15 mm here.');
insert into public.comments (id, post_id, author_id, parent_id, body) values
  ('00000000-0000-4000-8000-0000000004a1', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000004b1', 'Good to hear.');

insert into public.likes (user_id, post_id) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000001a1'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000002a1');

insert into public.activity_events (user_id, farm_id, kind, text) values
  ('00000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000a2', 'day_milestone', 'ava_grazier''s farm reached Day 12'),
  ('00000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-0000000000c1', 'day_milestone', 'kid_cattle''s farm reached Day 30');

insert into public.reports (id, reporter_id, target_type, target_id, reason, details, notes) values
  ('00000000-0000-4000-8000-0000000005b1', '00000000-0000-4000-8000-000000000002', 'post', '00000000-0000-4000-8000-0000000001a1', 'spam', 'Sample report', 'Moderator note: sample');
insert into public.moderation_actions (user_id, moderator_id, report_id, action, reason) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000005b1', 'note', 'Sample note');
insert into public.word_filter (term, kind) values ('badword', 'block'), ('flagword', 'flag');

-- Challenges: one public, one for Ava's group.
insert into public.challenges (id, kind, name, district, seed, starts_at, group_id) values
  ('00000000-0000-4000-8000-0000000006a1', 'fast_challenge', 'Spring 1998 on the Tablelands', 'nsw', 424242, now() - interval '1 day', null),
  ('00000000-0000-4000-8000-0000000006a2', 'daily_league', 'Tablelands league', 'nsw', 777, now() - interval '1 day', '00000000-0000-4000-8000-0000000000f1');
insert into public.challenge_entries (challenge_id, farm_id, user_id) values
  ('00000000-0000-4000-8000-0000000006a1', 'f0000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001');

-- Leaderboard rows for each account farm, all time, Grazier Score.
insert into public.leaderboard_entries (farm_id, user_id, board, mode, district, size, start_type, enterprise,
  period, period_key, score, days, farm_name)
select f.id, f.owner_id, 'grazier', f.mode, f.district, f.size, f.start_type, f.enterprise,
  'all', 'all', s.grazier_score, f.current_day, f.name
from public.farms f join public.farm_scores s on s.farm_id = f.id
where f.owner_id is not null;

-- Notifications and settings.
insert into public.notifications (user_id, kind, title, body, link, farm_id) values
  ('00000000-0000-4000-8000-000000000001', 'farm_alert', 'Trough low in Paddock 3', 'The trough in Paddock 3 is under a quarter full.', '/play', 'f0000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-000000000003', 'morning_reminder', 'First light at Brigalow', null, '/play', 'f0000000-0000-4000-8000-0000000000c1');
insert into public.notification_settings (user_id) values
  ('00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-00000000000b');
insert into public.notification_prefs (user_id, kind, push, email) values
  ('00000000-0000-4000-8000-000000000001', 'farm_alert', true, false);
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret, device) values
  ('00000000-0000-4000-8000-000000000001', 'https://web.push.apple.com/seed-ava', 'sample-p256dh', 'sample-auth', 'Phone');

-- Admin: a sponsor, a house ad and one view.
insert into public.sponsors (id, name, contact, notes) values
  ('00000000-0000-4000-8000-0000000007a1', 'Sample sponsor', 'Sample contact', 'Seed data');
insert into public.campaigns (id, sponsor_id, is_house_ad, name, starts_at, active) values
  ('00000000-0000-4000-8000-0000000007b1', null, true, 'House ad', now() - interval '1 day', true);
insert into public.ad_creatives (id, campaign_id, kind, headline, body, link_url) values
  ('00000000-0000-4000-8000-0000000007c1', '00000000-0000-4000-8000-0000000007b1', 'text', 'Sample house ad', 'One line about it.', 'https://example.org/');
insert into public.campaign_slots (campaign_id, slot_id) values
  ('00000000-0000-4000-8000-0000000007b1', 'pc_farm_rail');
insert into public.ad_events (slot_id, campaign_id, creative_id, user_id, kind) values
  ('pc_farm_rail', '00000000-0000-4000-8000-0000000007b1', '00000000-0000-4000-8000-0000000007c1', '00000000-0000-4000-8000-000000000001', 'view');
insert into public.ad_daily (day, slot_id, campaign_id, kind, count) values
  (date '2026-11-01', 'pc_farm_rail', '00000000-0000-4000-8000-0000000007b1', 'view', 1);

insert into public.admin_audit_log (admin_id, action, target_type, target_id, details) values
  ('00000000-0000-4000-8000-00000000000a', 'seed', 'database', 'seed', '{"sample": true}');
insert into public.daily_counts (day, metric, dims, count) values
  (date '2026-11-01', 'signups', '', 3);

-- Placeholder cache rows (not real figures).
insert into public.weather_daily (district, date, rain_mm, tmax_c, tmin_c, evap_mm) values
  ('nsw', date '2026-11-01', 0, 20, 10, 5);
insert into public.price_daily (indicator, saleyard, date, cents_per_kg) values
  ('sample_indicator', 'national', date '2026-11-01', 100);
