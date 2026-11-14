-- m3.1 Database: grants and row level security policies for every table.
--
-- Two locks on every table:
--   1. Grants say which roles may touch a table at all, and which columns.
--   2. Policies say which rows.
-- A table with no grant to anon or authenticated is server only. The server
-- uses service_role, which Supabase lets past row level security, so every
-- server-only table has row level security on and no policy.
--
-- Every policy asks app.uid() (auth.uid(), but an anonymous sign-in counts as
-- not signed in), wrapped as (select app.uid()) so Postgres works it out once
-- per query, as Supabase advises.

-- Start from nothing, whatever the platform's defaults granted.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------- accounts

-- account_status: role and bans. The player sees their own; admins see all.
-- Only the server changes it (admin actions go through the server and the audit log).
grant select on public.account_status to authenticated;
create policy account_status_read on public.account_status for select to authenticated
  using (user_id = (select app.uid()) or app.is_admin());

-- account_private: date of birth and own settings. Only the player, never
-- anyone else, not even an admin. The date of birth can't be changed by the player.
grant select on public.account_private to authenticated;
grant update (hide_ticker, marketing_opt_in) on public.account_private to authenticated;
create policy account_private_read on public.account_private for select to authenticated
  using (user_id = (select app.uid()));
create policy account_private_update on public.account_private for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));

-- profiles: the base table is read by its owner (and staff). Everyone else
-- reads public_profiles, which shows only safe columns and follows privacy,
-- blocks and the under-16 rule. Made by complete_sign_up(), never inserted directly.
grant select on public.profiles to authenticated;
grant update (
  username, display_name, avatar_path, bio, town, district, state, farms, enterprise,
  farm_size_band, farm_size_ha, real_farm_name, years_farming, farm_role,
  privacy_profile, privacy_farm_view, ticker_opt_in
) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = (select app.uid()) or app.is_staff());
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));

-- Profile extras: seen by whoever may see the profile's details; written by
-- the owner while they may use the community.
grant select, delete on public.profile_links, public.profile_experience to authenticated;
grant insert (user_id, kind, url, position), update (kind, url, position)
  on public.profile_links to authenticated;
grant insert (user_id, role, enterprise, place, from_year, to_year),
  update (role, enterprise, place, from_year, to_year)
  on public.profile_experience to authenticated;
grant select, delete on public.profile_education to authenticated;
grant insert (user_id, course_name, provider, year), update (course_name, provider, year)
  on public.profile_education to authenticated;
grant select, delete on public.farm_showcase_photos to authenticated;
grant insert (user_id, storage_path, caption, position), update (caption, position)
  on public.farm_showcase_photos to authenticated;

create policy profile_links_read on public.profile_links for select to authenticated
  using (user_id = (select app.uid()) or app.can_see_profile(user_id));
create policy profile_links_insert on public.profile_links for insert to authenticated
  with check (user_id = (select app.uid()) and app.can_use_community());
create policy profile_links_update on public.profile_links for update to authenticated
  using (user_id = (select app.uid()) and app.can_use_community())
  with check (user_id = (select app.uid()));
create policy profile_links_delete on public.profile_links for delete to authenticated
  using (user_id = (select app.uid()));

create policy profile_experience_read on public.profile_experience for select to authenticated
  using (user_id = (select app.uid()) or app.can_see_profile(user_id));
create policy profile_experience_insert on public.profile_experience for insert to authenticated
  with check (user_id = (select app.uid()) and app.can_use_community());
create policy profile_experience_update on public.profile_experience for update to authenticated
  using (user_id = (select app.uid()) and app.can_use_community())
  with check (user_id = (select app.uid()));
create policy profile_experience_delete on public.profile_experience for delete to authenticated
  using (user_id = (select app.uid()));

create policy profile_education_read on public.profile_education for select to authenticated
  using (user_id = (select app.uid()) or app.can_see_profile(user_id));
create policy profile_education_insert on public.profile_education for insert to authenticated
  with check (user_id = (select app.uid()) and app.can_use_community());
create policy profile_education_update on public.profile_education for update to authenticated
  using (user_id = (select app.uid()) and app.can_use_community())
  with check (user_id = (select app.uid()));
create policy profile_education_delete on public.profile_education for delete to authenticated
  using (user_id = (select app.uid()));

create policy farm_showcase_photos_read on public.farm_showcase_photos for select to authenticated
  using (
    user_id = (select app.uid())
    or app.is_staff()
    or (moderation_status = 'approved' and app.can_see_profile(user_id))
  );
create policy farm_showcase_photos_insert on public.farm_showcase_photos for insert to authenticated
  with check (
    user_id = (select app.uid())
    and app.can_use_community()
    and storage_path like ((select app.uid())::text || '/%')
  );
create policy farm_showcase_photos_update on public.farm_showcase_photos for update to authenticated
  using (user_id = (select app.uid()) and app.can_use_community())
  with check (user_id = (select app.uid()));
create policy farm_showcase_photos_delete on public.farm_showcase_photos for delete to authenticated
  using (user_id = (select app.uid()));

-- guest_sessions: server only.

-- farm_limits: anyone may read the limits (they are shown on screen).
grant select on public.farm_limits to anon, authenticated;
create policy farm_limits_read on public.farm_limits for select to anon, authenticated
  using (true);

-- -------------------------------------------------------------------- game

-- farms: the owner reads their own farm list; admins read all. Only the
-- server makes, changes or removes a farm (PRD 5.16).
grant select on public.farms to authenticated;
create policy farms_read on public.farms for select to authenticated
  using (owner_id = (select app.uid()) or app.is_admin());

-- farm_saves, farm_actions: server only. No grant, no policy. Not even the owner.
-- farm_actions is append only, for the server too (and a trigger, guards).
revoke update, delete on public.farm_actions from service_role;

-- farm_days (diary), farm_snapshots, farm_scores: the owner reads; the server writes.
grant select on public.farm_days, public.farm_snapshots, public.farm_scores to authenticated;
create policy farm_days_read on public.farm_days for select to authenticated
  using (app.owns_farm(farm_id));
create policy farm_snapshots_read on public.farm_snapshots for select to authenticated
  using (app.owns_farm(farm_id));
create policy farm_scores_read on public.farm_scores for select to authenticated
  using (app.owns_farm(farm_id) or app.is_admin());

-- challenges: public ones for anyone, group ones for the group. The seed is never sent.
grant select (
  id, kind, name, description, district, settings, starts_at, ends_at, group_id,
  sponsor_campaign_id, created_at, updated_at
) on public.challenges to anon, authenticated;
create policy challenges_read on public.challenges for select to anon, authenticated
  using (group_id is null or app.can_see_group(group_id));

-- challenge_entries: the player's own; written by the server.
grant select on public.challenge_entries to authenticated;
create policy challenge_entries_read on public.challenge_entries for select to authenticated
  using (user_id = (select app.uid()) or app.is_admin());

-- leaderboard_entries: no direct access. Read through leaderboard_rows, which
-- hides under-16 photos and profile links and rows across a block. Written by
-- the server only.

-- --------------------------------------------------------------- community

-- follows
grant select, delete on public.follows to authenticated;
grant insert (follower_id, followee_id) on public.follows to authenticated;
grant update (status) on public.follows to authenticated;
create policy follows_read on public.follows for select to authenticated
  using (
    app.can_use_community()
    and (
      follower_id = (select app.uid())
      or followee_id = (select app.uid())
      -- Anyone else sees only accepted follows, never a pending request.
      or (status = 'accepted' and app.can_see_profile(follower_id) and app.can_see_profile(followee_id))
    )
  );
create policy follows_insert on public.follows for insert to authenticated
  with check (
    follower_id = (select app.uid())
    and app.can_use_community()
    and app.is_member(followee_id)
    and not app.blocked_between(follower_id, followee_id)
  );
-- Only the person followed may accept a request.
create policy follows_accept on public.follows for update to authenticated
  using (followee_id = (select app.uid()) and app.can_use_community())
  with check (followee_id = (select app.uid()) and status = 'accepted');
create policy follows_delete on public.follows for delete to authenticated
  using (
    (follower_id = (select app.uid()) or followee_id = (select app.uid()))
    and app.can_use_community()
  );

-- blocks: only the blocker ever sees a block.
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;
create policy blocks_read on public.blocks for select to authenticated
  using (blocker_id = (select app.uid()));
create policy blocks_insert on public.blocks for insert to authenticated
  with check (blocker_id = (select app.uid()) and app.can_use_community());
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = (select app.uid()));

-- groups: the invite code is never in the grant; the owner gets it from group_invite_code().
grant select (
  id, name, photo_path, photo_status, description, visibility, owner_id, member_limit,
  created_at, updated_at
) on public.groups to authenticated;
grant insert (name, photo_path, description, visibility, owner_id) on public.groups to authenticated;
grant update (name, photo_path, description, visibility) on public.groups to authenticated;
grant delete on public.groups to authenticated;
create policy groups_read on public.groups for select to authenticated
  using (app.can_see_group(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = (select app.uid()) and app.can_use_community('groups'));
create policy groups_update on public.groups for update to authenticated
  using (owner_id = (select app.uid()) and app.can_use_community('groups'))
  with check (owner_id = (select app.uid()));
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = (select app.uid()) and app.can_use_community('groups'));

-- group_members: joining is through join_group() (it checks the code and the
-- limit). A member may leave; the owner may remove a member.
grant select, delete on public.group_members to authenticated;
create policy group_members_read on public.group_members for select to authenticated
  using (
    app.can_see_group(group_id)
    and (
      user_id = (select app.uid())
      or (app.is_member(user_id) and not app.blocked_between((select app.uid()), user_id))
    )
  );
create policy group_members_delete on public.group_members for delete to authenticated
  using (
    role <> 'owner'
    and app.can_use_community('groups')
    and (user_id = (select app.uid()) or app.is_group_owner(group_id, (select app.uid())))
  );

-- posts: players write plain posts only; share cards and day cards come from the server.
grant select on public.posts to authenticated;
grant insert (author_id, body, link_url, visibility, group_id) on public.posts to authenticated;
grant update (body, link_url, visibility) on public.posts to authenticated;
grant delete on public.posts to authenticated;
create policy posts_read on public.posts for select to authenticated
  using (app.post_row_visible(author_id, visibility, group_id, removed_at));
create policy posts_insert on public.posts for insert to authenticated
  with check (
    author_id = (select app.uid())
    and kind = 'post'
    and app.can_use_community('feed_posts')
    and (group_id is null or (app.can_use_community('groups')
         and app.is_group_member(group_id, (select app.uid()))))
  );
create policy posts_update on public.posts for update to authenticated
  using (
    author_id = (select app.uid()) and removed_at is null and app.can_use_community('feed_posts')
  )
  with check (author_id = (select app.uid()));
-- A post moderation removed stays for the record: the author can't delete it.
create policy posts_delete on public.posts for delete to authenticated
  using (
    author_id = (select app.uid()) and removed_at is null and app.can_use_community('feed_posts')
  );

-- post_photos: nobody but the author and staff sees a photo before the image check passes.
grant select, delete on public.post_photos to authenticated;
grant insert (post_id, storage_path, position) on public.post_photos to authenticated;
create policy post_photos_read on public.post_photos for select to authenticated
  using (
    app.post_visible(post_id)
    and (
      moderation_status = 'approved'
      or app.post_author(post_id) = (select app.uid())
      or app.is_staff()
    )
  );
create policy post_photos_insert on public.post_photos for insert to authenticated
  with check (
    app.post_author(post_id) = (select app.uid())
    and app.can_use_community('feed_posts')
    and storage_path like ((select app.uid())::text || '/%')
  );
create policy post_photos_delete on public.post_photos for delete to authenticated
  using (app.post_author(post_id) = (select app.uid()));

-- comments
grant select, delete on public.comments to authenticated;
grant insert (post_id, author_id, parent_id, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
create policy comments_read on public.comments for select to authenticated
  using (
    app.post_visible(post_id)
    and (
      author_id = (select app.uid())
      or app.is_staff()
      or (removed_at is null
          and app.is_member(author_id)
          and not app.blocked_between((select app.uid()), author_id))
    )
  );
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = (select app.uid())
    and app.can_use_community('feed_posts')
    and app.post_visible(post_id)
    and not app.blocked_between((select app.uid()), app.post_author(post_id))
  );
create policy comments_update on public.comments for update to authenticated
  using (
    author_id = (select app.uid()) and removed_at is null and app.can_use_community('feed_posts')
  )
  with check (author_id = (select app.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select app.uid()));

-- likes
grant select, delete on public.likes to authenticated;
grant insert (user_id, post_id, comment_id) on public.likes to authenticated;
create policy likes_read on public.likes for select to authenticated
  using (
    (case when post_id is not null then app.post_visible(post_id)
          else app.comment_visible(comment_id) end)
    and (
      user_id = (select app.uid())
      or (app.is_member(user_id) and not app.blocked_between((select app.uid()), user_id))
    )
  );
create policy likes_insert on public.likes for insert to authenticated
  with check (
    user_id = (select app.uid())
    and app.can_use_community('feed_posts')
    and (case when post_id is not null
              then app.post_visible(post_id)
                   and not app.blocked_between((select app.uid()), app.post_author(post_id))
              else app.comment_visible(comment_id)
                   and not app.blocked_between((select app.uid()), app.comment_author(comment_id))
         end)
  );
create policy likes_delete on public.likes for delete to authenticated
  using (user_id = (select app.uid()));

-- activity_events (the ticker): read only, written by the server.
grant select on public.activity_events to authenticated;
create policy activity_events_read on public.activity_events for select to authenticated
  using ((public or user_id = (select app.uid())) and app.ticker_visible(user_id));

-- reports: the reporter sees their own report's state, never the moderator's notes.
grant select (id, target_type, target_id, reason, details, status, created_at, resolved_at)
  on public.reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select app.uid()) or app.is_staff());
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select app.uid()) and app.can_use_community());

-- moderation_actions and word_filter: staff read; the server writes.
grant select on public.moderation_actions, public.word_filter to authenticated;
create policy moderation_actions_read on public.moderation_actions for select to authenticated
  using (app.is_staff());
create policy word_filter_read on public.word_filter for select to authenticated
  using (app.is_staff());

-- ------------------------------------------------------------------ system

grant select (key, enabled, updated_at) on public.feature_switches to anon, authenticated;
create policy feature_switches_read on public.feature_switches for select to anon, authenticated
  using (true);

grant select (key, value, updated_at) on public.site_settings to anon, authenticated;
create policy site_settings_read on public.site_settings for select to anon, authenticated
  using (is_public or app.is_admin());

grant select on public.admin_audit_log to authenticated;
create policy admin_audit_log_read on public.admin_audit_log for select to authenticated
  using (app.is_admin());
-- Append only, for the server too.
revoke update, delete on public.admin_audit_log from service_role;
-- (The account-deletion cascade still clears admin_id: that runs as the table owner.)

-- rate_limit_rules, rate_limit_hits: server only.

-- notifications: the player's own inbox. They can mark read and remove; the server writes.
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select app.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select app.uid()));

grant select, insert, update, delete on public.notification_settings, public.notification_prefs
  to authenticated;
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));
create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (user_id = (select app.uid()))
  with check (user_id = (select app.uid()));

grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth_secret, device) on public.push_subscriptions
  to authenticated;
create policy push_subscriptions_read on public.push_subscriptions for select to authenticated
  using (user_id = (select app.uid()));
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = (select app.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select app.uid()));

-- weather_daily, price_daily: engine data, server only.

grant select on public.daily_counts to authenticated;
create policy daily_counts_read on public.daily_counts for select to authenticated
  using (app.is_admin());

-- ------------------------------------------------------------------- money

grant select (slot_id, enabled, settings, provider) on public.ad_slots to anon, authenticated;
create policy ad_slots_read on public.ad_slots for select to anon, authenticated
  using (true);

-- Sponsors, campaigns, creatives, the slot links, events and roll-ups: admins
-- read; the server writes, and the server picks which ad a viewer gets (16 ads/serve).
grant select on public.sponsors, public.campaigns, public.ad_creatives, public.campaign_slots,
  public.ad_events, public.ad_daily to authenticated;
create policy sponsors_read on public.sponsors for select to authenticated using (app.is_admin());
create policy campaigns_read on public.campaigns for select to authenticated using (app.is_admin());
create policy ad_creatives_read on public.ad_creatives for select to authenticated
  using (app.is_admin());
create policy campaign_slots_read on public.campaign_slots for select to authenticated
  using (app.is_admin());
create policy ad_events_read on public.ad_events for select to authenticated using (app.is_admin());
create policy ad_daily_read on public.ad_daily for select to authenticated using (app.is_admin());

grant select on public.products to anon, authenticated;
create policy products_read on public.products for select to anon, authenticated
  using (active or app.is_admin());

-- purchases: the buyer sees what they bought; the Stripe ids stay with the server.
grant select (id, user_id, product_id, farm_id, amount_cents, currency, status, paid_at, created_at)
  on public.purchases to authenticated;
create policy purchases_read on public.purchases for select to authenticated
  using (user_id = (select app.uid()) or app.is_admin());

grant select on public.account_entitlements to authenticated;
create policy account_entitlements_read on public.account_entitlements for select to authenticated
  using (user_id = (select app.uid()) or app.is_admin());

-- stripe_customers, stripe_events: server only.
