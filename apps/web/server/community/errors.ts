import 'server-only';

/** A refusal with a plain message the player can read. */
export class CommunityError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

interface DbError {
  code?: string;
  hint?: string;
  message?: string;
  constraint?: string;
}

/**
 * Turn what the database refused into a plain message. The database's rules are the authority:
 * the word filter, the rate limits and the row level security all answer here. Anything it does
 * not know about is left to be logged as a failure (the message is never sent on, because a
 * driver's text can carry values).
 */
export function fromDatabase(e: unknown): CommunityError | null {
  const err = e as DbError;
  if (err?.hint === 'rate_limited') {
    return new CommunityError(
      429,
      'That was a lot in a short time. Wait a little and try again.',
      'rate_limited',
    );
  }
  if (err?.hint === 'word_filter') {
    return new CommunityError(
      400,
      'Some of that text can not be used here. Change the wording and try again.',
      'word_filter',
    );
  }
  switch (err?.code) {
    case '42501':
      // Row level security or a rule said no. The same words for "not yours" and "can't see it".
      return new CommunityError(403, 'You can not do that.', 'refused');
    case '23505':
      return new CommunityError(409, 'That is already done.', 'duplicate');
    case '23514':
    case '22001':
    case '22P02':
    case '23502':
    case '23503':
      return new CommunityError(400, 'That was not sent properly.', 'invalid');
    default:
      return null;
  }
}
