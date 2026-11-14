// The notification types, in one place the settings page and the server share.
// Nothing here imports the engine or the server, so the browser can read it.
//
// Defaults (PRD 13, 5.15): nothing is sent until a device is added or email is turned on, so a
// default of "on" only matters after the player has taken that step. The reminder is off until
// the player turns Daily Farm reminders on. Email is off for every type: it is a fallback the
// player chooses, never a surprise.

export const NOTIFY_KINDS = [
  'morning_reminder',
  'later_nudge',
  'farm_alert',
  'evening_warning',
  'social',
  'challenge',
  'system',
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export const isNotifyKind = (v: unknown): v is NotifyKind =>
  typeof v === 'string' && (NOTIFY_KINDS as readonly string[]).includes(v);

export interface KindInfo {
  kind: NotifyKind;
  /** The switch's label on the settings page. */
  label: string;
  /** One plain line saying what it sends. */
  help: string;
  /** On by default for push. */
  push: boolean;
  /** On by default for email (always false). */
  email: boolean;
  /** A community type: never made for an account under 16, or while the community is off. */
  community: boolean;
  /**
   * A reminder that only has meaning at its moment. Inside quiet hours it is dropped, never
   * held for later. Every other type is held until quiet hours end.
   */
  expires: boolean;
  /** Leaves no inbox row when the player has turned it off (it exists only to ping). */
  pingOnly: boolean;
}

export const KIND_INFO: Record<NotifyKind, KindInfo> = {
  morning_reminder: {
    kind: 'morning_reminder',
    label: 'Daily Farm morning reminder',
    help: 'One notification at first light on your Daily Farm, at the time you pick.',
    push: false,
    email: false,
    community: false,
    expires: true,
    pingOnly: true,
  },
  later_nudge: {
    kind: 'later_nudge',
    label: 'One later reminder',
    help: 'One more notification some hours after the morning one, if the farm has not been opened that day. Never more than one.',
    push: false,
    email: false,
    community: false,
    expires: true,
    pingOnly: true,
  },
  farm_alert: {
    kind: 'farm_alert',
    label: 'Farm alerts',
    help: 'Trough low or empty, no water, about 2 days of feed left, cattle through the tape, calving started, deaths and why, and rain.',
    push: true,
    email: false,
    community: false,
    expires: false,
    pingOnly: false,
  },
  evening_warning: {
    kind: 'evening_warning',
    label: 'Evening warning',
    help: 'One notification in the evening if the Daily Farm has not been opened and something needs attention, such as a mob with no water.',
    push: true,
    email: false,
    community: false,
    expires: true,
    pingOnly: false,
  },
  social: {
    kind: 'social',
    label: 'Community',
    help: 'A new follower, a comment, likes (bundled) and group invites.',
    push: true,
    email: false,
    community: true,
    expires: false,
    pingOnly: false,
  },
  challenge: {
    kind: 'challenge',
    label: 'Challenges and leagues',
    help: 'When a challenge or league starts and when it finishes.',
    push: true,
    email: false,
    community: false,
    expires: false,
    pingOnly: false,
  },
  system: {
    kind: 'system',
    label: 'Account and purchase notices',
    help: 'Confirmations about your account and purchases. They always appear in your inbox. This switch is for push and email.',
    push: false,
    email: false,
    community: false,
    expires: false,
    pingOnly: false,
  },
};

/** Most devices one account may keep. */
export const MAX_DEVICES = 10;

/** The rule the database applies to a link (notifications.link), so the browser can check it too. */
export const SAFE_LINK = /^\/([^/\\]|$)/;
export function isSafeLink(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length <= 300 &&
    SAFE_LINK.test(v) &&
    !/[\u0000-\u001f\u007f\s]/.test(v)
  );
}
