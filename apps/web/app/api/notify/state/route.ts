import { capabilities } from '@/server/notify/deps';
import { notifyRoute } from '@/server/notify/route';
import { readState } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/**
 * What the settings page shows: this account's switches, quiet hours and devices, and what this
 * copy of the game can do (push and email need keys; the switch can be off).
 */
export const GET = notifyRoute({ name: 'state', max: 60 }, async ({ user, nd }) => {
  const [state, caps, member] = await Promise.all([
    readState(nd.sql, user.id),
    capabilities(nd),
    nd.sql.query<{ ok: boolean }>('select app.community_ok($1) as ok', [user.id]),
  ]);
  return {
    ...state,
    available: caps,
    vapidPublicKey: caps.push ? nd.integrations.vapidPublicKey : null,
    community: member.rows[0]?.ok === true,
  };
});
