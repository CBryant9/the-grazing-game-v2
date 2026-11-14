-- m3.1 Database: the rows every database needs, local, preview and production.

-- Feature switches (PRD 11.7), every key in FEATURE_SWITCHES (packages/shared).
-- All start OFF in the database, so a new database shows nothing until
-- Claudia turns it on in admin. The launch defaults in PRD 11.7 (sign-ups,
-- both modes, leaderboards and push on) are set by her before launch.
insert into public.feature_switches (key, enabled, note) values
  ('signups_open', false, 'PRD 11.7 launch default: on'),
  ('daily_farm', false, 'PRD 11.7 launch default: on'),
  ('fast_farm', false, 'PRD 11.7 launch default: on'),
  ('community', false, 'Master switch for section 9'),
  ('feed_posts', false, null),
  ('groups', false, null),
  ('activity_ticker', false, null),
  ('farm_viewing', false, null),
  ('leaderboards', false, 'PRD 11.7 launch default: on'),
  ('ads', false, 'Master switch for section 10.1'),
  ('video_ads', false, null),
  ('banner_ads', false, null),
  ('adsense', false, null),
  ('purchases', false, null),
  ('push_notifications', false, 'PRD 11.7 launch default: on'),
  ('maintenance_mode', false, null)
on conflict (key) do nothing;

-- Ad slots (PRD 10.1), every id in AD_SLOTS (packages/shared), all off.
insert into public.ad_slots (slot_id, settings) values
  ('pc_farm_rail', '{"max_cards": 3}'),
  ('pc_community_side', '{"max_cards": 3, "advertise_spots": 20}'),
  ('pc_profile_side', '{"max_cards": 1}'),
  ('pc_leaderboard_banner', '{}'),
  ('phone_banner', '{"min_seconds_between": 300, "show_seconds_min": 30, "show_seconds_max": 60}'),
  ('pc_banner', '{"min_seconds_between": 300, "show_seconds_min": 30, "show_seconds_max": 60}'),
  ('video_between_days', '{"min_game_days_between": 10, "min_seconds_between": 300, "skip_after_seconds": 5}'),
  ('video_between_years', '{"skip_after_seconds": 5}'),
  ('video_daily_summary', '{"max_per_day": 1, "skip_after_seconds": 5}'),
  ('summary_sponsor_card', '{}'),
  ('feed_sponsored', '{"every_n_posts": 8}'),
  ('challenge_sponsor', '{}'),
  ('landing_sponsors', '{}')
on conflict (slot_id) do nothing;

-- Farms at once (PRD 5.5), as FARM_LIMITS in packages/shared.
insert into public.farm_limits (tier, mode, max_active) values
  ('guest', 'daily', 0),
  ('guest', 'fast', 1),
  ('free', 'daily', 2),
  ('free', 'fast', 2),
  ('pack', 'daily', 5),
  ('pack', 'fast', 5)
on conflict (tier, mode) do nothing;

-- What can be bought (PRD 10.3, 21 rows 29 and 30). Prices in cents, GST
-- included, all inactive until Claudia makes them in Stripe and switches
-- purchases on.
insert into public.products (id, name, kind, price_cents, grants) values
  ('farm_pack', 'Farm pack', 'pack', 3000, '{farm_pack,supporter_badge,full_diary}'),
  ('farm_pack_no_ads', 'Farm pack with no ads', 'pack', 5000,
    '{farm_pack,no_ads,supporter_badge,full_diary}'),
  ('upgrade_no_ads', 'Upgrade to no ads', 'upgrade', 2000, '{no_ads}'),
  ('keep_going_fast', 'Keep going (Fast Farm)', 'keep_going', 500, '{}'),
  ('keep_going_daily_under_6m', 'Keep going (Daily Farm, under 6 months)', 'keep_going', 1500, '{}'),
  ('keep_going_daily_6m', 'Keep going (Daily Farm, 6 months)', 'keep_going', 2500, '{}'),
  ('keep_going_daily_1y', 'Keep going (Daily Farm, 1 year)', 'keep_going', 5000, '{}'),
  ('keep_going_daily_2y', 'Keep going (Daily Farm, over 2 years)', 'keep_going', 10000, '{}')
on conflict (id) do nothing;

-- Rate limits (PRD 17, 9.9). Defaults to check with Claudia.
insert into public.rate_limit_rules (action, max_count, window_seconds, new_account_max, new_account_days) values
  ('post', 20, 3600, 5, 7),
  ('comment', 60, 3600, 15, 7),
  ('like', 300, 3600, null, 7),
  ('follow', 100, 86400, 30, 7),
  ('report', 20, 86400, 5, 7),
  ('group_create', 5, 86400, 1, 7),
  ('sign_up', 3, 3600, null, 0),
  ('job', 1200, 3600, null, 0),
  ('farm_create', 10, 3600, null, 0),
  ('ticker_event', 6, 3600, null, 0)
on conflict (action) do nothing;

-- Site settings (11.8).
insert into public.site_settings (key, value, is_public) values
  ('announcement', '{"text": null, "link": null}', true),
  ('districts_available', '["cq", "nsw", "cw", "wv"]', true),
  ('community_rules', '{"text": null}', true)
on conflict (key) do nothing;
