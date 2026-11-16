import 'server-only';
import { featureSwitches } from '@/server/auth/accounts';
import { authDeps } from '@/server/auth/deps';
import { jarFor } from '@/server/auth/provider';
import { callerKey } from '@/server/auth/route';
import { allow } from '@/server/game/http';
import { logFailure } from '@/server/logging';

/**
 * The live activity ticker, read side (PRD 9.4). A public GET: a visitor may call it. It is not a
 * community route, because the website's own pages show the ticker to visitors too.
 *
 * The answer is `{ lines: [{ user, text, at }] }`, at most 10 recent lines, or `{ lines: [] }`
 * when the Community or Ticker switch is off, there is no database, or the caller asked too often.
 * A line is shown only when its author is a community member (16 or over, not banned or
 * suspended), switched the ticker on, and does not have a private profile. A signed-in caller also
 * sees no line from anyone they have blocked or who has blocked them, and nothing at all when they
 * turned the ticker off for themselves, are under 16, or are banned or suspended. The
 * browser roles can not read the table as a visitor, so this reads on the server's own connection
 * with each of those checks written out in the query. Answers are never cached.
 */
export const dynamic = 'force-dynamic';

const LINES = 10;
/** Lines older than this are not shown. A stand-in until Claudia says otherwise. */
const RECENT_DAYS = 3;

const send = (lines: { user: string; text: string; at: string }[], status = 200): Response =>
  new Response(JSON.stringify({ lines }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export async function GET(req: Request): Promise<Response> {
  if (!allow(`ticker:${callerKey(req, 'address')}`, 30, 60_000)) {
    return new Response(JSON.stringify({ lines: [] }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '60',
      },
    });
  }
  const deps = authDeps();
  if (!deps) return send([]);
  try {
    const on = await featureSwitches(deps.sql);
    if (!on.community || !on.activity_ticker) return send([]);
    let viewer: string | null = null;
    try {
      const user = await deps.provider.verify(jarFor(req));
      if (user && !user.anonymous) viewer = user.id;
    } catch {
      viewer = null;
    }
    if (viewer) {
      const v = await deps.sql.query<{ has_account: boolean; member: boolean; hidden: boolean }>(
        `select a.user_id is not null as has_account,
                app.member_raw($1) as member,
                coalesce(a.hide_ticker, false) as hidden
           from (select $1::uuid as id) i
           left join public.account_private a on a.user_id = i.id`,
        [viewer],
      );
      const row = v.rows[0];
      // A finished account that is not a member (under 16, banned, suspended) or that has hidden
      // the ticker gets nothing. An account still signing up reads as a visitor.
      if (row?.has_account && (!row.member || row.hidden)) return send([]);
      if (!row?.has_account) viewer = null;
    }
    const r = await deps.sql.query<{ username: string; text: string; at: string }>(
      `select p.username, e.text,
              to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
         from public.activity_events e
         join public.profiles p on p.user_id = e.user_id
        where e.public
          and e.created_at > now() - ($3::int * interval '1 day')
          and app.member_raw(e.user_id)
          and p.ticker_opt_in
          and p.privacy_profile <> 'private'
          and ($1::uuid is null or not app.blocked_pair($1::uuid, e.user_id))
        order by e.created_at desc, e.id desc
        limit $2`,
      [viewer, LINES, RECENT_DAYS],
    );
    return send(r.rows.map((x) => ({ user: x.username, text: x.text, at: x.at })));
  } catch (e) {
    logFailure({ route: 'ticker', reason: 'ticker_read_failed' }, e);
    return send([]);
  }
}
