import { Later } from '@/components/admin/Later';
import { requireAdmin } from '@/server/admin/page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  return (
    <Later
      title="Moderation"
      what="The queue of reports and flagged photos, with remove, keep, warn, suspend and ban. It comes with the community. Suspending and banning an account is already possible from the Users page."
    />
  );
}
