/**
 * Ask the server about a line that is still being drawn, without asking on
 * every pointer move.
 *
 * The first ask goes at once. Asks that follow within `everyMs` are held,
 * and only the newest of them is sent when the time is up, so a drag makes
 * a few requests a second at most. An answer is used only if it is for the
 * newest ask: an older answer that arrives late is dropped.
 */
export interface LatestOnly<A> {
  /** Ask about `arg`, soon. A newer ask replaces one that is waiting. */
  schedule(arg: A): void;
  /** Ask about `arg` now (a drag has ended), whatever the time since the last ask. */
  flush(arg: A): void;
  /** Forget what is waiting, and ignore any answer still on its way. */
  cancel(): void;
}

export interface LatestOptions<A, R> {
  /** The shortest time between one ask going out and the next, in milliseconds. */
  everyMs: number;
  call(arg: A): Promise<R>;
  /** The answer to the newest ask. */
  done(result: R, arg: A): void;
  /** The newest ask failed. */
  fail(error: unknown, arg: A): void;
}

export function latestOnly<A, R>(options: LatestOptions<A, R>): LatestOnly<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { arg: A } | null = null;
  let lastSent = -Infinity;
  let newest = 0;

  const send = (arg: A): void => {
    lastSent = Date.now();
    const mine = ++newest;
    options.call(arg).then(
      (r) => {
        if (mine === newest) options.done(r, arg);
      },
      (e: unknown) => {
        if (mine === newest) options.fail(e, arg);
      },
    );
  };

  const fire = (): void => {
    timer = null;
    const p = pending;
    pending = null;
    if (p) send(p.arg);
  };

  return {
    schedule(arg) {
      pending = { arg };
      if (timer !== null) return;
      const wait = Math.max(0, lastSent + options.everyMs - Date.now());
      if (wait === 0) fire();
      else timer = setTimeout(fire, wait);
    },
    flush(arg) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
      send(arg);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
      newest++;
    },
  };
}
