import { route } from '@/server/game/http';
import { setupOptions } from '@/server/game/setup';

export const dynamic = 'force-dynamic';

/** The setup choices and their real figures. They live on the server, not in the browser. */
export const GET = route({ name: 'setup' }, async () => setupOptions());
