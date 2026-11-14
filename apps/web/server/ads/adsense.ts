import 'server-only';

/**
 * The seam where Google AdSense would plug in (BUILD_PLAN 5.1: "AdSense (off)"). It is EMPTY on
 * purpose, and it does nothing until Claudia decides to use it.
 *
 * What exists: the `adsense` feature switch (off), the `provider` and `adsense_unit_id` columns on
 * `ad_slots`, and this interface. What does not exist, so nothing can load by accident:
 * - no Google script address, no script tag, no component that adds one;
 * - no publisher id or unit id anywhere in the repo (the admin has no field for them yet);
 * - no consent banner (an AdSense unit needs one, and a cookie notice, before it may load).
 *
 * To turn it on later, Claudia needs her own AdSense account and a consent banner, and a new
 * milestone fills in `scriptUrl` and the draw step. Even then the gate below must say yes: the
 * switch is on, the player has agreed to advertising cookies, and the player is 16 or over (an
 * under-16 account is never shown an interest-based ad: PRD 8.3).
 */
export interface AdsenseAdapter {
  /** Whether this build can draw an AdSense unit at all. False. */
  readonly available: boolean;
  /** The address of the provider's script. Null: none is known, so none can load. */
  readonly scriptUrl: string | null;
}

export const adsense: AdsenseAdapter = { available: false, scriptUrl: null };

export interface AdsenseGate {
  /** The player agreed to advertising cookies in a consent banner (which does not exist yet). */
  consent: boolean;
  /** The `adsense` feature switch. */
  switchOn: boolean;
  underSixteen: boolean;
}

/** May the provider's code load for this player? Not while the adapter is empty, whatever else is true. */
export function adsenseMayLoad(gate: AdsenseGate): boolean {
  return (
    adsense.available &&
    adsense.scriptUrl !== null &&
    gate.switchOn &&
    gate.consent &&
    !gate.underSixteen
  );
}
