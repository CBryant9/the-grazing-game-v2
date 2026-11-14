import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/Shell';
import { Finish } from '@/components/account/Finish';

// Not for search engines, and never kept by the service worker (lib/pwa/cacheablePage.ts).
export const metadata: Metadata = {
  title: 'Finish your account',
  description: 'Choose a username and say when you were born to finish making your account.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Finish your account">
      <Finish />
    </AccountShell>
  );
}
