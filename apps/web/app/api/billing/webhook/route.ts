import { webhookRoute } from '@/server/billing/route';

export const dynamic = 'force-dynamic';

/**
 * Stripe's webhook. The signature on the raw body is the only gate, so the body is read as text,
 * checked, and only then parsed (server/billing/webhook.ts).
 */
export const POST = webhookRoute();
