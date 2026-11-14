import 'server-only';
import type { ActionRequest, SimpleAction } from '../../lib/game/types';
import { GameError } from './game';

/** Check the body of a preview or act request. It names a job; the server finds the rest. */
export function parseActionRequest(body: unknown): ActionRequest {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.todo === 'string') return { todo: b.todo };
    if (typeof b.action === 'object' && b.action !== null) {
      return { action: b.action as SimpleAction };
    }
  }
  throw new GameError(400, 'Say which job to do.');
}

const VERSION = /^[0-9a-f]{1,32}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const NOT_SENT = 'That request was not sent properly. Reload the page and try again.';

const field = (body: unknown, name: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined;

/** The farm version a request says the player was looking at. Every act, Next day and skip sends one. */
export function parseVersion(body: unknown): string {
  const v = field(body, 'version');
  if (typeof v !== 'string' || !VERSION.test(v)) throw new GameError(400, NOT_SENT);
  return v;
}

/** The one-use id the browser made for an act request. */
export function parseRequestId(body: unknown): string {
  const v = field(body, 'requestId');
  if (typeof v !== 'string' || !REQUEST_ID.test(v)) throw new GameError(400, NOT_SENT);
  return v;
}
