-- m3.1 Database: the community (PRD 9). All of it sits behind the community
-- switch, and none of it is open to an account under 16 (8.3). Both are
-- enforced in the access rules (20261114000700_access.sql), not only in screens.

create table public.follows (
  follower_id uuid not null references public.profiles (user_id) on delete cascade,
  followee_id uuid not null references public.profiles (user_id) on delete cascade,
  -- A followers-only profile needs approval (9.7). Set by a trigger, never by the follower.
  status text not null default 'pending' check (status in ('accepted', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table public.follows enable row level security;
create index follows_followee on public.follows (followee_id, status);
create trigger follows_touch before update on public.follows
  for each row execute function app.touch_updated_at();

create table public.blocks (
  blocker_id uuid not null references public.profiles (user_id) on delete cascade,
  blocked_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
create index blocks_blocked on public.blocks (blocked_id);
create trigger blocks_touch before update on public.blocks
  for each row execute function app.touch_updated_at();

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 60),
  -- A path in the `group-photos` bucket, in the group's own folder (checked below).
  photo_path text check (char_length(photo_path) <= 300),
  -- As avatars: never shown before the image check passes on that exact file.
  photo_status text not null default 'none'
    check (photo_status in ('none', 'pending', 'approved', 'rejected')),
  photo_object_id uuid,
  photo_object_updated_at timestamptz,
  photo_checked_at timestamptz,
  description text check (char_length(description) <= 1000),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  owner_id uuid not null references public.profiles (user_id) on delete cascade,
  -- Shown only to the owner, through group_invite_code(). Column grants leave it out.
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', '')
    check (invite_code ~ '^[0-9a-f]{12,32}$'),
  -- 9.6: up to 100 members [Proposed].
  member_limit smallint not null default 100 check (member_limit between 2 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (photo_path is null or photo_path like id::text || '/%'),
  check (photo_status <> 'approved' or photo_object_id is not null)
);
alter table public.groups enable row level security;
create index groups_owner on public.groups (owner_id);
create trigger groups_touch before update on public.groups
  for each row execute function app.touch_updated_at();

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;
create index group_members_user on public.group_members (user_id);
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';
create trigger group_members_touch before update on public.group_members
  for each row execute function app.touch_updated_at();

alter table public.challenges
  add constraint challenges_group_fk foreign key (group_id)
  references public.groups (id) on delete cascade;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (user_id) on delete cascade,
  -- Players write 'post'. 'share_farm' and 'day_card' are made by the server (9.2, 9.3).
  kind text not null default 'post' check (kind in ('post', 'share_farm', 'day_card')),
  body text check (char_length(body) <= 2000),
  link_url text check (link_url ~ '^https://' and char_length(link_url) <= 300),
  farm_id uuid references public.farms (id) on delete set null,
  farm_day integer check (farm_day >= 0),
  -- A server-made figure card for Share my farm and day cards: words and numbers only.
  card jsonb,
  visibility text not null default 'public' check (visibility in ('public', 'followers')),
  group_id uuid references public.groups (id) on delete cascade,
  edited_at timestamptz,
  -- Moderation hides a post; the author's own delete removes it.
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'post' or body is not null)
);
alter table public.posts enable row level security;
create index posts_author on public.posts (author_id, created_at desc);
create index posts_feed on public.posts (created_at desc) where removed_at is null;
create index posts_group on public.posts (group_id, created_at desc) where group_id is not null;
create trigger posts_touch before update on public.posts
  for each row execute function app.touch_updated_at();

create table public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 300),
  position smallint not null check (position between 1 and 4),
  -- Only the server's image check changes this. Nobody else sees a photo before 'approved'.
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  checked_at timestamptz,
  -- The exact file the image check passed. Others read the file only when
  -- its storage id and change time still match (20261114001200_storage.sql).
  storage_object_id uuid,
  storage_object_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, position),
  check (moderation_status <> 'approved' or storage_object_id is not null)
);
alter table public.post_photos enable row level security;
create index post_photos_pending on public.post_photos (created_at) where moderation_status = 'pending';
create trigger post_photos_touch before update on public.post_photos
  for each row execute function app.touch_updated_at();

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (user_id) on delete cascade,
  -- One level of replies (9.2): a reply's parent is never itself a reply (trigger).
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  edited_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create index comments_post on public.comments (post_id, created_at);
create index comments_author on public.comments (author_id);
create trigger comments_touch before update on public.comments
  for each row execute function app.touch_updated_at();

create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((post_id is null) <> (comment_id is null))
);
alter table public.likes enable row level security;
create unique index likes_post on public.likes (user_id, post_id) where post_id is not null;
create unique index likes_comment on public.likes (user_id, comment_id) where comment_id is not null;
create index likes_post_count on public.likes (post_id) where post_id is not null;
create index likes_comment_count on public.likes (comment_id) where comment_id is not null;
create trigger likes_touch before update on public.likes
  for each row execute function app.touch_updated_at();

-- The live activity ticker (9.4). Facts written by the server, rate limited there.
create table public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  farm_id uuid references public.farms (id) on delete set null,
  kind text not null check (char_length(kind) between 1 and 40),
  text text not null check (char_length(text) between 1 and 200),
  public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.activity_events enable row level security;
create index activity_events_recent on public.activity_events (created_at desc) where public;
create index activity_events_user on public.activity_events (user_id, created_at desc);
create trigger activity_events_touch before update on public.activity_events
  for each row execute function app.touch_updated_at();

-- Reports (9.9) and the moderation history (11.3).
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'profile', 'group')),
  target_id uuid not null,
  reason text not null check (
    reason in ('spam', 'abuse', 'nudity', 'violence', 'hate', 'self_harm', 'impersonation', 'other')
  ),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  moderator_id uuid references auth.users (id) on delete set null,
  action text check (action in ('removed', 'kept', 'warned', 'suspended', 'banned')),
  notes text check (char_length(notes) <= 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create index reports_open on public.reports (created_at) where status = 'open';
create index reports_target on public.reports (target_type, target_id);
create index reports_reporter on public.reports (reporter_id);
create trigger reports_touch before update on public.reports
  for each row execute function app.touch_updated_at();

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  moderator_id uuid references auth.users (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  action text not null check (action in ('removed', 'warned', 'suspended', 'banned', 'unbanned', 'note')),
  reason text check (char_length(reason) <= 2000),
  until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.moderation_actions enable row level security;
create index moderation_actions_user on public.moderation_actions (user_id, created_at desc);
create trigger moderation_actions_touch before update on public.moderation_actions
  for each row execute function app.touch_updated_at();

-- The bad-word filter (9.9) for usernames, names, posts, comments and groups.
-- 'block' refuses the text; 'flag' lets it through and opens a report.
create table public.word_filter (
  id uuid primary key default gen_random_uuid(),
  -- Lower-case letters, digits and single spaces only, matched as whole words.
  term text not null unique check (term ~ '^[a-z0-9]+( [a-z0-9]+)*$' and char_length(term) between 2 and 60),
  kind text not null default 'block' check (kind in ('block', 'flag')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.word_filter enable row level security;
create trigger word_filter_touch before update on public.word_filter
  for each row execute function app.touch_updated_at();
