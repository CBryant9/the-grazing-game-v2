import { consentGet, consentPost } from '@/server/analytics/consent';

export const dynamic = 'force-dynamic';

/** The analytics consent choice: an account's in the database, a guest's in a cookie (milestone 5.3). */
export const GET = consentGet;
export const POST = consentPost;
