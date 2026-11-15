import 'server-only';
import { asUser, featureSwitches } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { readOnlyJar } from '../admin/gate';
import { logFailure } from '../logging';
import type { SqlRunner } from '../db/sql';
import { BOARD_LABELS, HEADLINE_IS_STAND_IN, type AnyBoard } from './score';
import { asVisitor, parseBoardQuery, readBoard, type BoardQuery, type BoardView } from './read';

/**
 * The public leaderboard page's data (PRD 9.8), worked out on the server for each request. With no
 * database keys or the leaderboards switch off there is no page (a plain 404). A visitor reads as
 * a visitor; a signed-in player reads as themselves (their own row is pinned; a community member
 * may also narrow to friends or one of their groups). Nothing here is sent as script.
 */
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

export async function boardPage(
  cookies: Record<string, string | undefined>,
  rawQuery: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): Promise<BoardPageProps | null> {
  const deps = authDeps();
  if (!deps) return null;
  try {
    const switches = await featureSwitches(deps.sql);
    if (!switches.leaderboards) return null;
    const jar = readOnlyJar(() =>
      Object.entries(cookies)
        .filter((e): e is [string, string] => typeof e[1] === 'string')
        .map(([name, value]) => ({ name, value })),
    );
    const user = await deps.provider.verify(jar).catch(() => null);
    let member = false;
    let signedIn = false;
    if (user && !user.anonymous) {
      const r = await deps.sql.query<{ member: boolean }>(
        'select app.member_raw(user_id) as member from public.profiles where user_id = $1',
        [user.id],
      );
      if (r.rows[0]) {
        signedIn = true;
        member = r.rows[0].member && switches.community;
      }
    }
    const query = parseBoardQuery(rawQuery);
    if (!member) {
      query.friends = false;
      query.group = null;
    }
    if (!switches.groups) query.group = null;
    const run = <T>(work: (tx: SqlRunner) => Promise<T>): Promise<T> =>
      signedIn ? asUser(deps.sql, user!.id, work) : asVisitor(deps.sql, work);
    const { view, groups } = await run(async (tx) => {
      const groups =
        member && switches.groups
          ? (
              await tx.query<{ id: string; name: string }>(
                `select g.id, g.name from public.groups g
                   join public.group_members m on m.group_id = g.id and m.user_id = app.uid()
                  order by g.name limit 50`,
              )
            ).rows
          : [];
      // Only one of the viewer's own groups.
      if (query.group && !groups.some((g) => g.id === query.group)) query.group = null;
      return { groups, view: await readBoard(tx, query, now) };
    });
    return {
      query,
      view,
      label: BOARD_LABELS[query.board as AnyBoard],
      standIn: HEADLINE_IS_STAND_IN && query.board === 'grazier',
      signedIn,
      member,
      groups,
      ticker: switches.community && switches.activity_ticker,
    };
  } catch (e) {
    logFailure({ route: 'leaderboards-page', reason: 'board_read_failed' }, e);
    return null;
  }
}
