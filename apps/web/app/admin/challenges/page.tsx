import { Later } from '@/components/admin/Later';
import { requireAdmin } from '@/server/admin/page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  return (
    <Later
      title="Challenges"
      what="Making Fast Farm challenges and Daily leagues, and seeing their entries and results."
    />
  );
}
