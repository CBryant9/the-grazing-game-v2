-- m3.1 Database: storage buckets and their access rules.
--
--   avatars        profile photos, in a folder named for the account id
--   group-photos   group photos, in a folder named for the group id
--   post-photos    post and showcase photos, in the author's folder
--   snapshots      the map on past days; server only
--   ad-media       sponsor images and videos, uploaded in admin by the server;
--                  public, so ads load fast from our own storage (10.1)
--
-- A photo is never shown to anyone else before the image check has passed on
-- that exact file (BUILD_PLAN 4.3). Others read a photo only through a row
-- that points at the file's storage id and change time (app.photo_file_visible),
-- never by its path: a file swapped in under the same name does not match.
-- File types and sizes are checked by the bucket. Re-running this migration
-- brings an existing bucket's limits up to date.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('group-photos', 'group-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-photos', 'post-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('snapshots', 'snapshots', false, 1048576, array['application/json', 'application/gzip']),
  -- No SVG: a public SVG can carry script.
  ('ad-media', 'ad-media', true, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owners work in their own folder; anyone else reads only a checked file.
create policy gg_photos_read on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'post-photos', 'group-photos')
    and (
      (bucket_id <> 'group-photos' and (storage.foldername(name))[1] = (select app.uid())::text)
      or (bucket_id = 'group-photos'
          and app.is_group_owner(app.try_uuid((storage.foldername(name))[1]), (select app.uid())))
      or app.photo_file_visible(bucket_id, id, updated_at)
    )
  );

-- Avatars: the owner's own folder.
create policy gg_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select app.uid())::text);
-- No update rule: an avatar is never changed in place. A new photo is delete
-- then upload, so it always has a new id and goes back through the check.
create policy gg_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select app.uid())::text);

-- Group photos: the group's owner, in the group's folder, while groups are open to them.
create policy gg_group_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'group-photos'
    and app.is_group_owner(app.try_uuid((storage.foldername(name))[1]), (select app.uid()))
    and app.can_use_community('groups')
  );
create policy gg_group_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'group-photos'
    and app.is_group_owner(app.try_uuid((storage.foldername(name))[1]), (select app.uid()))
  );

-- Post and showcase photos: the author's own folder, while they may post.
create policy gg_post_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = (select app.uid())::text
    and app.can_use_community()
  );
create policy gg_post_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select app.uid())::text);

-- snapshots and ad-media: no policies for the browser roles. The server
-- writes both; ad-media is a public bucket, read by its public address.
