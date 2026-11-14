/**
 * The shapes the community pages draw. The server builds them (server/community/data.ts); the page
 * parts only show them. Nothing here is a rule or a formula: names, words and counts.
 */

export interface Author {
  id: string;
  username: string;
  displayName: string | null;
  hasAvatar: boolean;
}

export interface PhotoView {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
}

/** The facts on a Share my farm post or a day card, fixed when it was posted. */
export interface Card {
  v: 1;
  kind: 'farm' | 'day';
  title: string;
  /** Lines of plain facts: a label and a value, or just a line. */
  facts: { label: string | null; value: string }[];
}

export interface PostView {
  id: string;
  kind: 'post' | 'share_farm' | 'day_card';
  body: string | null;
  linkUrl: string | null;
  /** A link only when it is still a safe https address. */
  linkHref: string | null;
  card: Card | null;
  farmDay: number | null;
  /** A day card's farm, set only when the viewer may look at it (PRD 9.5). */
  farmId?: string;
  visibility: 'public' | 'followers';
  groupId: string | null;
  createdAt: string;
  editedAt: string | null;
  /** Taken down by a moderator. Only its author gets this row, and sees it as removed. */
  removed: boolean;
  mine: boolean;
  author: Author;
  likes: number;
  comments: number;
  liked: boolean;
  photos: PhotoView[];
}

export interface CommentView {
  id: string;
  /** A top-level comment with more replies than the page shows: the page links to its thread. */
  moreReplies: boolean;
  parentId: string | null;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  removed: boolean;
  mine: boolean;
  author: Author;
  likes: number;
  liked: boolean;
}

export interface Page<T> {
  items: T[];
  /** The cursor for the next page, or null at the end. Keyset: never an offset. */
  next: string | null;
}

export interface PersonCard {
  id: string;
  username: string;
  displayName: string | null;
  hasAvatar: boolean;
  district: string | null;
}

export type FeedTab = 'friends' | 'everyone' | 'groups';
export const FEED_TABS: { id: FeedTab; label: string }[] = [
  { id: 'friends', label: "Friends' days" },
  { id: 'everyone', label: 'Everyone' },
  { id: 'groups', label: 'Groups' },
];
