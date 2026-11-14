import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/Shell';
import { SignIn } from '@/components/account/SignIn';

// Not for search engines, and never kept by the service worker (lib/pwa/cacheablePage.ts).
export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in or make an account for The Grazing Game with an emailed link or Google.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Sign in">
      <SignIn />
    </AccountShell>
  );
}
