import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/Shell';
import { Store } from '@/components/billing/Store';

// Not for search engines, and never kept by the service worker (lib/pwa/cacheablePage.ts).
export const metadata: Metadata = {
  title: 'Store',
  description: 'One-off purchases for The Grazing Game, when anything is for sale.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Store">
      <Store />
    </AccountShell>
  );
}
