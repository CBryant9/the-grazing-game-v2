-- Download my data (PRD 18, 21a) includes the analytics consent choice (milestone 5.3), added at the
-- m7 join. The function is the one in 20261114001000_server_functions.sql with one more key,
-- "analytics_consent": the yes or no and when it was given, or null when no choice was made.
-- Grants are as before: the signed-in player only.

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.uid();
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select to_jsonb(u) - 'encrypted_password' from (
      select id, email, created_at from auth.users where id = v_user) u),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = v_user),
    'private', (select to_jsonb(a) from public.account_private a where a.user_id = v_user),
    'status', (select to_jsonb(s) - 'ban_reason' from public.account_status s where s.user_id = v_user),
    'links', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.profile_links x where x.user_id = v_user),
    'experience', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.profile_experience x where x.user_id = v_user),
    'education', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.profile_education x where x.user_id = v_user),
    'showcase_photos', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.farm_showcase_photos x where x.user_id = v_user),
    'farms', (select coalesce(jsonb_agg(
        to_jsonb(f) - 'rollover_claimed_at'
        || jsonb_build_object(
          'scores', (select to_jsonb(s) from public.farm_scores s where s.farm_id = f.id),
          'days', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]')
                     from public.farm_days d where d.farm_id = f.id))
      ), '[]') from public.farms f where f.owner_id = v_user),
    'follows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.follows x
                 where x.follower_id = v_user or x.followee_id = v_user),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.blocks x where x.blocker_id = v_user),
    'posts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.posts x where x.author_id = v_user),
    'post_photos', (select coalesce(jsonb_agg(to_jsonb(ph)), '[]') from public.post_photos ph
                     join public.posts p on p.id = ph.post_id where p.author_id = v_user),
    'comments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.comments x where x.author_id = v_user),
    'likes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.likes x where x.user_id = v_user),
    'groups', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.group_members x where x.user_id = v_user),
    'reports_made', (select coalesce(jsonb_agg(jsonb_build_object(
        'target_type', r.target_type, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at)), '[]')
      from public.reports r where r.reporter_id = v_user),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.notifications x where x.user_id = v_user),
    'notification_settings', (select to_jsonb(x) from public.notification_settings x where x.user_id = v_user),
    'notification_prefs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.notification_prefs x where x.user_id = v_user),
    'push_devices', (select coalesce(jsonb_agg(jsonb_build_object('device', x.device, 'created_at', x.created_at)), '[]')
      from public.push_subscriptions x where x.user_id = v_user),
    'purchases', (select coalesce(jsonb_agg(to_jsonb(x) - 'stripe_checkout_session_id' - 'stripe_payment_intent_id'), '[]')
      from public.purchases x where x.user_id = v_user),
    'entitlements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.account_entitlements x where x.user_id = v_user),
    'activity', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.activity_events x where x.user_id = v_user),
    'leaderboard_rows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.leaderboard_entries x where x.user_id = v_user),
    'challenge_entries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.challenge_entries x where x.user_id = v_user),
    'ad_events', (select coalesce(jsonb_agg(jsonb_build_object(
        'slot_id', x.slot_id, 'kind', x.kind, 'campaign_id', x.campaign_id, 'created_at', x.created_at)), '[]')
      from public.ad_events x where x.user_id = v_user),
    -- m7: the analytics consent choice (milestone 5.3). Null when no choice was made, which means no.
    'analytics_consent', (select jsonb_build_object('granted', c.granted, 'decided_at', c.decided_at)
      from public.analytics_consent c where c.user_id = v_user)
  );
end;
$$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
