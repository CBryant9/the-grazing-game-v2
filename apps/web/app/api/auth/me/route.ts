import { accountOf, featureSwitches } from '@/server/auth/accounts';
import { authRoute } from '@/server/auth/route';
import { adSlotsFor } from '@/server/ads/serve';
import type { MeResponse } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

/**
 * What the screens need to know about the player, worked out on the server. The browser never
 * decides any of it: the under-16 flags come from the date of birth in the database.
 *
 * - `accounts`: false when sign-in is not set up. The screens then say so in a plain line.
 * - `community`: the community may be shown: the switch is on and the account is a member by the
 *   database's own test (16 or over, not banned, not suspended).
 * - `leaderboards`: the leaderboards switch is on, so the app shell links the boards (PRD 6.4).
 * - `interestAds`: ads may be aimed by interest (not under 16).
 */
const NONE: MeResponse = {
  accounts: false,
  signedIn: false,
  signupsOpen: false,
  needsSignUp: false,
  refused: false,
  username: null,
  method: null,
  community: false,
  leaderboards: false,
  interestAds: true,
  ads: [],
  scope: null,
};

export const GET = authRoute(
  { name: 'me', max: 120, by: 'session' },
  async (ctx): Promise<MeResponse> => {
    if (!ctx.deps) return NONE;
    const switches = await featureSwitches(ctx.deps.sql);
    const base: MeResponse = {
      ...NONE,
      accounts: true,
      signupsOpen: switches.signups_open,
      // The boards are a public page: open to anyone once their switch is on (PRD 6.4, 9.8).
      leaderboards: switches.leaderboards,
      // Empty unless ads are on (see server/ads): a guest is shown ads like a free player.
      ads: await adSlotsFor(ctx.deps.sql, null),
    };
    const user = await ctx.deps.provider.session(ctx.jar).catch(() => null);
    if (!user || user.anonymous) return base;
    const account = await accountOf(ctx.deps, user);
    if (!account.profile) {
      const refused = await ctx.deps.sql.query(
        'select 1 from public.signup_refusals where user_id = $1',
        [user.id],
      );
      return {
        ...base,
        signedIn: true,
        needsSignUp: true,
        refused: refused.rowCount > 0,
        method: user.method,
        scope: user.id,
      };
    }
    const under = account.profile.underSixteen;
    const member = switches.community
      ? Boolean(
          (await ctx.deps.sql.query<{ m: boolean }>('select app.member_raw($1) as m', [user.id]))
            .rows[0]?.m,
        )
      : false;
    return {
      ...base,
      signedIn: true,
      username: account.profile.username,
      method: user.method,
      community: !under && member,
      interestAds: !under,
      ads: await adSlotsFor(ctx.deps.sql, { userId: user.id }),
      scope: user.id,
    };
  },
);
