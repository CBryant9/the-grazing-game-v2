import { describe, expect, it } from 'vitest';
import { errorKind, failureLine } from './logging';

class AuthApiError extends Error {
  constructor(
    message: string,
    readonly code?: unknown,
  ) {
    super(message);
  }
}

describe('failure log lines', () => {
  it('say the route, a reason code, and the error class and code', () => {
    const e = Object.assign(new Error('no'), { code: '23505' });
    expect(failureLine({ route: 'auth-finish', reason: 'sign_up_failed' }, e)).toBe(
      'failed route=auth-finish reason=sign_up_failed error=Error code=23505',
    );
    expect(
      failureLine(
        { route: 'auth-email', reason: 'send_link_failed' },
        new AuthApiError('x', 'over_email_send_rate_limit'),
      ),
    ).toBe(
      'failed route=auth-email reason=send_link_failed error=AuthApiError code=over_email_send_rate_limit',
    );
  });

  it('say which farm failed, by its id, and drop anything that is not an id', () => {
    const id = 'ab'.repeat(16);
    expect(
      failureLine({ route: 'daily-rollover', reason: 'farm_failed', farm: id }, new Error('x')),
    ).toBe(`failed route=daily-rollover reason=farm_failed farm=${id} error=Error`);
    expect(
      failureLine({ route: 'daily-rollover', reason: 'farm_failed', farm: 'me@example.test' }),
    ).toBe('failed route=daily-rollover reason=farm_failed');
  });

  it('never carry the error message, an address, a token or a link', () => {
    const bad = new AuthApiError(
      'Email address "who@example.com" is invalid https://x.supabase.co/auth?token=abc123',
      'who@example.com',
    );
    const line = failureLine({ route: 'auth-email', reason: 'send_link_failed' }, bad);
    expect(line).not.toMatch(/who|example\.com|token|abc123|supabase|invalid/);
    expect(errorKind(bad)).toEqual({ error: 'AuthApiError' });
  });

  it('cope with a thrown value that is not an error', () => {
    expect(failureLine({ route: 'r', reason: 'x' }, 'who@example.com')).toBe(
      'failed route=r reason=x error=string',
    );
    expect(failureLine({ route: 'r', reason: 'x' }, null)).toBe(
      'failed route=r reason=x error=object',
    );
    expect(failureLine({ route: 'r', reason: 'x' })).toBe('failed route=r reason=x');
  });
});
