/**
 * What the sign-in and account screens get from the server (milestone 3.2).
 * Everything here is decided on the server. The browser never works out an
 * age, a flag or a limit.
 */

export interface MeResponse {
  /** False when sign-in is not set up: the screens say so in a plain line and offer guest play. */
  accounts: boolean;
  signedIn: boolean;
  signupsOpen: boolean;
  /** Signed in, but sign-up (username, date of birth) is not finished. */
  needsSignUp: boolean;
  /** This sign-in was refused as under 14: no form, no retry. */
  refused: boolean;
  username: string | null;
  /** How they signed in: `email` or `google`. */
  method: string | null;
  /** The community may be shown (not under 16, and its switch is on). */
  community: boolean;
  /** Ads may be aimed by interest (not under 16). */
  interestAds: boolean;
  /**
   * The ad slots that are on, with something to show, for this player (m5.1). Empty with every
   * ad switch off (the launch default), with no keys, and for an account that owns no-ads: then
   * the screens draw no ad markup and ask for no ad.
   */
  ads: string[];
  /** A key for this player's offline copy: the account id, or null for a guest. */
  scope: string | null;
}

export type FinishResult =
  | { ok: true; moved: number; noRoom: boolean }
  | { ok: false; reason: string; message: string; final?: boolean };

export const SENT_WORDS = 'If that address can sign in, a link is on its way. Check your email.';
