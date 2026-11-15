import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/Shell';
import { Account } from '@/components/account/Account';
import { Consent } from '@/components/analytics/Consent';
import { Vitals } from '@/components/analytics/Vitals';

// Not for search engines, and never kept by the service worker (lib/pwa/cacheablePage.ts).
export const metadata: Metadata = {
  title: 'Your account',
  description: 'Your username, your data, and sign out or delete your account.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Your account">
      <Account />
      <Consent />
      <Vitals page="account" />
    </AccountShell>
  );
}
