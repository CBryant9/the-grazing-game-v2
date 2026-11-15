import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/Shell';
import { PurchaseWait } from '@/components/billing/PurchaseWait';

export const metadata: Metadata = {
  title: 'Thanks',
  description: 'Your purchase is being confirmed.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Thanks">
      <PurchaseWait />
    </AccountShell>
  );
}
