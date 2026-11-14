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
