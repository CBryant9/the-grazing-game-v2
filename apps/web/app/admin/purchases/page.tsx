import { Later } from '@/components/admin/Later';
import { requireAdmin } from '@/server/admin/page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  return (
    <Later
      title="Purchases"
      what="Whether Stripe is connected, the products, who bought what, and refunds. The purchases switch is on the Feature switches page now."
    />
  );
}
