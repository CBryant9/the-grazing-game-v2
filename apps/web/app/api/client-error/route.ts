import { clientErrorRoute } from '@/server/errors/clientError';

// A browser error from the game page or a signed-in page, forwarded to Sentry (milestone 5.5).
export const POST = clientErrorRoute;
