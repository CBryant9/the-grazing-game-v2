import type {
  ActionRequest,
  ActRequest,
  ActResponse,
  DayResponse,
  FarmResponse,
  FarmsResponse,
  PastDayWire,
  PastDaysResponse,
  PreviewResponse,
  RecordResponse,
  SetupChoices,
  SetupOptions,
  SkipRequestLength,
  StaleResponse,
} from './types';

/** An error with a plain message the player can read. Never a stack or a code. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** The HTTP status, when the server answered. */
    readonly status?: number,
    /** A short word the server sends beside the message, such as `save_failed`. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * A save that did not go through (the server tried it again itself and could not store it).
 * Nothing was stored, so asking again is safe: a job carries its one-use id, and a day or skip
 * carries the farm version it was shown on, so it can only run once.
 */
export const SAVE_FAILED = 'save_failed';
/** How long to wait before each new try, in ms. Three tries more, then the player is told. */
export const SAVE_RETRY_MS: readonly number[] = [1500, 4000, 9000];
let retryDelays: readonly number[] = SAVE_RETRY_MS;
/** For tests: the waits between tries. */
export function setSaveRetryDelays(ms: readonly number[]): void {
  retryDelays = ms;
}

/** Who wants to know that the game is saving again (the screen shows "Saving again"). */
let savingWatcher: ((again: boolean) => void) | null = null;
export function onSavingAgain(watch: ((again: boolean) => void) | null): void {
  savingWatcher = watch;
}

/** What was being saved, in words, for the message when it could not be. */
function whatWas(path: string): string {
  const name = path.split('?')[0]!;
  if (name === 'act') return 'That job';
  if (name === 'day') return 'Next day';
  if (name === 'skip') return 'That skip';
  if (name === 'farm') return 'Your new farm';
  if (name === 'inbox') return 'Marking your messages read';
  return 'That change';
}

export const notSavedMessage = (path: string): string =>
  `${whatWas(path)} was not saved. Nothing on your farm has changed. Check your connection and try again.`;

/** What the player is told when a request never reached the server. The offline view looks for exactly this. */
export const UNREACHABLE = 'The game could not be reached. Check your connection and try again.';
const GENERIC = 'Something went wrong. Try again in a moment.';

async function once<T>(path: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/game/${path}`, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON: a proxy or a crash page. Say it plainly below.
  }
  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : GENERIC;
    const code =
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { code?: unknown }).code === 'string'
        ? (data as { code: string }).code
        : undefined;
    throw new ApiError(message, res.status, code);
  }
  if (data === null) throw new ApiError(GENERIC);
  return data as T;
}

/**
 * One request. A save the server could not store is asked again after a wait, with a longer
 * wait each time, while the screen says "Saving again". If it still fails the player is told
 * what was not saved. Nothing is ever shown as done before the server says it is stored.
 */
async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await once<T>(path, method, body);
      if (attempt > 0) savingWatcher?.(false);
      return out;
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== SAVE_FAILED || method === 'GET') {
        if (attempt > 0) savingWatcher?.(false);
        throw e;
      }
      const wait = retryDelays[attempt];
      if (wait === undefined) {
        savingWatcher?.(false);
        throw new ApiError(notSavedMessage(path), 503, SAVE_FAILED);
      }
      savingWatcher?.(true);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export const api = {
  setup: () => request<SetupOptions>('setup', 'GET'),
  farm: () => request<FarmResponse>('farm', 'GET'),
  create: (choices: SetupChoices) => request<FarmResponse>('farm', 'POST', choices),
  remove: () => request<FarmResponse>('farm', 'DELETE'),
  farms: () => request<FarmsResponse>('farms', 'GET'),
  openFarm: (id: string | null) => request<FarmResponse | { ok: true }>('farms', 'POST', { id }),
  deleteFarm: (id: string) => request<FarmsResponse>('farms', 'DELETE', { id }),
  pastDays: () => request<PastDaysResponse>('past', 'GET'),
  pastDay: (day: number) => request<PastDayWire>(`past?day=${day}`, 'GET'),
  preview: (req: ActionRequest) => request<PreviewResponse>('preview', 'POST', req),
  act: (req: ActRequest) => request<ActResponse>('act', 'POST', req),
  day: (version: string) => request<DayResponse | StaleResponse>('day', 'POST', { version }),
  record: (before?: number) =>
    request<RecordResponse>(`record${before === undefined ? '' : `?before=${before}`}`, 'GET'),
  inboxRead: (upTo: number) => request<FarmResponse>('inbox', 'POST', { upTo }),
  // Daily Farm (milestone 3.3). These routes sit beside the game's, under /api/daily.
  dailyAck: () => request<FarmResponse>('../daily/ack', 'POST', {}),
  dailyDone: () => request<FarmResponse>('../daily/done', 'POST', {}),
  skip: (length: SkipRequestLength, anyway: boolean, version: string) =>
    request<DayResponse | StaleResponse>('skip', 'POST', { length, anyway, version }),
};
