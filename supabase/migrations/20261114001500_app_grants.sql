-- m3.1 Database: who may run the `app` helpers. Last, so it covers every one.
--
-- `app` is not exposed by the Data API, so a browser can't call these by
-- name. Even so the browser roles get only the helpers that a row level
-- security policy, a view or a storage rule calls with their rights. Helpers
-- that take another account's id and answer about it (community_ok,
-- is_admin_user, can_find_profile_for, can_view_farm_for), the rate limiter,
-- the farm limit and the trigger functions are left out: they run only
-- inside other security definer functions. A test lists the exact set.

revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on all functions in schema app to service_role;

grant execute on function
  app.uid(),
  app.is_admin(),
  app.is_staff(),
  app.feature_on(text),
  app.is_member(uuid),
  app.is_restricted(uuid),
  app.can_use_community(text),
  app.blocked_between(uuid, uuid),
  app.can_find_profile(uuid),
  app.can_see_profile(uuid),
  app.is_group_member(uuid, uuid),
  app.is_group_owner(uuid, uuid),
  app.can_see_group(uuid),
  app.post_row_visible(uuid, text, uuid, timestamptz),
  app.post_visible(uuid),
  app.post_author(uuid),
  app.comment_visible(uuid),
  app.comment_author(uuid),
  app.ticker_visible(uuid),
  app.owns_farm(uuid),
  app.can_view_farm(uuid),
  app.photo_file_visible(text, uuid, timestamptz),
  app.try_uuid(text)
to anon, authenticated;
