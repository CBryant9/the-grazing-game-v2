-- m3.1 Database: who may run the app helpers. Last, so it covers every one.
--
-- The app schema is not exposed by the Data API (keep it out of the exposed schemas
-- setting), so a browser can't call these by name. Row level security
-- policies, views and storage rules run their helpers with the caller's
-- rights, so the browser roles need these. Each one that takes another
-- person's id answers only what the caller is allowed to know (is_member,
-- blocked_between, is_group_member, is_group_owner, post_author,
-- comment_author; see 20261114000700_access_helpers.sql). The raw forms that
-- answer about anyone (member_raw, blocked_pair, group_member_raw,
-- group_owner_raw, post_row_visible, is_restricted, community_ok,
-- is_admin_user, can_find_profile_for, can_view_farm_for), the rate limiter,
-- the farm limit and the trigger functions run only inside other security
-- definer functions and the server. A test lists the exact set.

revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on all functions in schema app to service_role;

grant execute on function
  app.uid(),
  app.is_admin(),
  app.is_staff(),
  app.feature_on(text),
  app.is_member(uuid),
  app.can_use_community(text),
  app.blocked_between(uuid, uuid),
  app.can_find_profile(uuid),
  app.can_see_profile(uuid),
  app.is_group_member(uuid, uuid),
  app.is_group_owner(uuid, uuid),
  app.can_see_group(uuid),
  app.post_visible(uuid),
  app.post_author(uuid),
  app.comment_visible(uuid),
  app.comment_author(uuid),
  app.ticker_visible(uuid),
  app.owns_farm(uuid),
  app.can_view_farm(uuid),
  app.photo_file_visible(text, uuid, timestamptz),
  app.board_username(uuid),
  app.board_shows_owner(uuid),
  app.try_uuid(text)
to anon, authenticated;
