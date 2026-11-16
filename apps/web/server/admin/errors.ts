import 'server-only';

/** A refusal with a plain message the admin can read. */
export class AdminError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 429 | 500 | 503,
    message: string,
  ) {
    super(message);
  }
}
