import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/Shell';
import { Notifications } from '@/components/notify/Notifications';

// Not for search engines, and never kept by the service worker (lib/pwa/cacheablePage.ts).
export const metadata: Metadata = {
  title: 'Your notifications',
  description: 'Your inbox, what you are sent, quiet hours and your devices.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Your notifications">
      <Notifications />
    </AccountShell>
  );
}
