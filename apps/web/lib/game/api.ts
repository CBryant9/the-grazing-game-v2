import type {
  ActionRequest,
  ActRequest,
  ActResponse,
  DayResponse,
  FarmResponse,
  PreviewResponse,
  SetupChoices,
  SetupOptions,
  SkipRequestLength,
  StaleResponse,
} from './types';

/** An error with a plain message the player can read. Never a stack or a code. */
export class ApiError extends Error {}

const OFFLINE = 'The game could not be reached. Check your connection and try again.';
const GENERIC = 'Something went wrong. Try again in a moment.';

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
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
    throw new ApiError(OFFLINE);
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
    throw new ApiError(message);
  }
  if (data === null) throw new ApiError(GENERIC);
  return data as T;
}

export const api = {
  setup: () => request<SetupOptions>('setup', 'GET'),
  farm: () => request<FarmResponse>('farm', 'GET'),
  create: (choices: SetupChoices) => request<FarmResponse>('farm', 'POST', choices),
  remove: () => request<FarmResponse>('farm', 'DELETE'),
  preview: (req: ActionRequest) => request<PreviewResponse>('preview', 'POST', req),
  act: (req: ActRequest) => request<ActResponse>('act', 'POST', req),
  day: (version: string) => request<DayResponse | StaleResponse>('day', 'POST', { version }),
  inboxRead: (upTo: number) => request<FarmResponse>('inbox', 'POST', { upTo }),
  skip: (length: SkipRequestLength, anyway: boolean, version: string) =>
    request<DayResponse | StaleResponse>('skip', 'POST', { length, anyway, version }),
};
