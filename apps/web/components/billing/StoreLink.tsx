'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { billingApi } from './api';

/**
 * A link to the store that only exists while the store is open. It asks the server once. With
 * purchases off, no keys or no accounts it shows nothing at all, so no buy button appears anywhere.
 */
export function StoreLink({ label, className }: { label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    billingApi.store().then(
      (s) => {
        if (live) setOpen(s.selling && s.items.length > 0);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  if (!open) return null;
  return (
    <Link href="/store" className={className ?? 'btn ghost'}>
      {label}
    </Link>
  );
}
