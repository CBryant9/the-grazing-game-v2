import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/Shell';
import { CheckEmail } from '@/components/account/SignIn';

// Not for search engines, and never kept by the service worker (lib/pwa/cacheablePage.ts).
export const metadata: Metadata = {
  title: 'Check your email',
  description: 'Open the sign-in link we emailed you.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Check your email">
      <CheckEmail />
    </AccountShell>
  );
}
