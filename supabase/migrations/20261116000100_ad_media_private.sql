-- m5.5 security review: the ad-media bucket is private.
--
-- It was public (20261114001200_storage.sql) so ads could load from storage's public address.
-- Nothing reads that address: the site serves every ad file through /api/ads/media/<id>, which
-- reads storage with the server's key and answers only while the creative and its campaign are
-- on. A public bucket meant a switched-off sponsor's file stayed readable by anyone who had kept
-- its storage address. Private, the only way to a file is the server's route.
--
-- No browser role has a policy on this bucket, so private means server only.

update storage.buckets set public = false where id = 'ad-media';
