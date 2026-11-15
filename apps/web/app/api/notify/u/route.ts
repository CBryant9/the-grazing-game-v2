import { tokenRoute } from '@/server/notify/route';
import { unsubscribeResponse } from '@/server/notify/unsub';

export const dynamic = 'force-dynamic';

/**
 * The unsubscribe link in an email. No sign-in, no cookie: the encrypted, expiring token in the
 * address is the credential, and it can only turn off one type's email for one account.
 * GET shows a confirm button and changes nothing. POST (the one-click mail providers send, or the
 * button) does it.
 */
const handle = tokenRoute('u', 30, unsubscribeResponse);
export const GET = handle;
export const POST = handle;
