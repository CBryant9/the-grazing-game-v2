-- m3.1 Database: storage buckets and their access rules.
--
--   avatars       profile photos, in a folder named for the account id
--   post-photos   post and showcase photos, in the author's folder; seen by
--                 others only once the image check has passed (BUILD_PLAN 4.3)
--   snapshots     the map on past days; server only
--   ad-media      sponsor images and videos, uploaded in admin by the server;
--                 public, so ads load fast from our own storage (10.1)
-- File types and sizes are checked by the bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-photos', 'post-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('snapshots', 'snapshots', false, 1048576, array['application/json', 'application/gzip']),
  ('ad-media', 'ad-media', true, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

-- Avatars: the owner writes their own folder. Others see an avatar when they
-- may find the profile (so never an under-16 account's photo, 8.3).
create policy gg_avatars_read on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and app.can_find_profile(app.try_uuid((storage.foldername(name))[1]))
  );
create policy gg_avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy gg_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy gg_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Post photos: the author uploads to their own folder while they may post.
-- Anyone else reads a photo only through a post_photos or showcase row they
-- may see, which is only once it is approved.
create policy gg_post_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'post-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.post_photos ph where ph.storage_path = name)
      or exists (select 1 from public.farm_showcase_photos s where s.storage_path = name)
    )
  );
create policy gg_post_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and app.can_use_community()
  );
create policy gg_post_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- snapshots and ad-media: no policies for the browser roles. The server
-- writes both; ad-media is a public bucket, read by its public address.
