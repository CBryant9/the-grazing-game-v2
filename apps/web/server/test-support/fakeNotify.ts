import type { MailMessage, MailResult, MailSender } from '../notify/mail';
import type {
  PushMessage,
  PushOptions,
  PushResult,
  PushSender,
  PushTarget,
} from '../notify/webpush';

/**
 * Fakes for the push service and the mail service, so the tests prove the game's own handling
 * (what is sent, to whom, when, how often) and not Resend's or Apple's. What they can NOT prove:
 * a real push service's or Resend's behaviour. One run against each is owed with real keys.
 */
export class FakePush implements PushSender {
  readonly sent: { endpoint: string; message: PushMessage; options: PushOptions }[] = [];
  readonly attempts: { endpoint: string; id: string }[] = [];
  /** Results to give for an endpoint, in order. When empty, success. */
  readonly plan = new Map<string, (PushResult | 'throw')[]>();

  async send(to: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult> {
    this.attempts.push({ endpoint: to.endpoint, id: message.id });
    const next = this.plan.get(to.endpoint)?.shift();
    if (next === 'throw') throw new Error('the push service blew up');
    if (next && !next.ok) return next;
    this.sent.push({ endpoint: to.endpoint, message, options });
    return { ok: true };
  }
}

export class FakeMail implements MailSender {
  readonly sent: MailMessage[] = [];
  readonly plan: (MailResult | 'throw')[] = [];

  async send(message: MailMessage): Promise<MailResult> {
    const next = this.plan.shift();
    if (next === 'throw') throw new Error('the mail service blew up');
    if (next && !next.ok) return next;
    this.sent.push(message);
    return { ok: true };
  }
}

/** A valid-looking browser key pair for a saved device. */
export const FAKE_P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
export const FAKE_AUTH = Buffer.alloc(16, 9).toString('base64url');
