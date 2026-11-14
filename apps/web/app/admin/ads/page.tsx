import { Later } from '@/components/admin/Later';
import { requireAdmin } from '@/server/admin/page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  return (
    <Later
      title="Ads and sponsors"
      what="Each ad slot with its own switch, sponsors, campaigns and the sponsor report. The master ads switch is on the Feature switches page now."
    />
  );
}
