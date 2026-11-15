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
