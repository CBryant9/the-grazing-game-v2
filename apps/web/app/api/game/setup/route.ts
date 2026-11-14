import { route } from '@/server/game/http';
import { setupOptions } from '@/server/game/setup';
import { sheepSwitchOn } from '@/server/game/switches';

export const dynamic = 'force-dynamic';

/** The setup choices and their real figures. They live on the server, not in the browser. */
export const GET = route({ name: 'setup' }, async () => setupOptions(await sheepSwitchOn()));
