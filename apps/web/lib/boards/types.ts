/** The shapes a board page draws (Stage 4, milestone 4.1). Names and numbers only, never a rule. */

export interface BoardRow {
  rank: number;
  username: string;
  /** Only when the row may show its owner (16 or over, not private). */
  userId: string | null;
  hasAvatar: boolean;
  district: string;
  score: number;
  days: number;
  farmName: string | null;
  mine: boolean;
}

export interface BoardView {
  rows: BoardRow[];
  /** The viewer's own best row on this board, pinned at the bottom. */
  mine: BoardRow | null;
  /** The real years that have a board, newest first (for the real-year picker). */
  years: number[];
  /** The real year shown, on the real-year board. */
  year: number | null;
}

export interface BoardQuery {
  board:
    'grazier' | 'profit_per_ha' | 'beef_per_ha' | 'ground_cover' | 'days_survived' | 'real_year';
  period: 'week' | 'month' | 'season' | 'all';
  mode: 'daily' | 'fast' | null;
  district: string | null;
  size: 'small' | 'medium' | 'large' | null;
  start: 'running' | 'scratch' | null;
  enterprise: 'grazing' | 'mixed' | null;
  realYear: number | null;
  /** Only farms of people the viewer follows. */
  friends: boolean;
  /** Only farms of this group's members. */
  group: string | null;
  /** Only this challenge's farms. */
  challenge: string | null;
}

/** What the public leaderboard page draws. */
export interface BoardPageProps {
  query: BoardQuery;
  view: BoardView;
  label: { name: string; unit: string };
  standIn: boolean;
  signedIn: boolean;
  /** May use the friends and group filters (a community member with the switch on). */
  member: boolean;
  groups: { id: string; name: string }[];
  ticker: boolean;
}
