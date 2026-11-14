import NextLink from 'next/link';
import type { ComponentProps } from 'react';

/**
 * A link for the public pages. It does not prefetch what it points to. Prefetching
 * fetches the next page's data (and, for /play, the game's code) while the page is
 * still starting up. These pages are small and static, so a click is fast anyway.
 */
export default function SiteLink(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
