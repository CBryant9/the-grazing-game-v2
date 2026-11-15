import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { SITE } from '@gg/shared';
import { fontVariables } from '@/lib/fonts';
import { SITE_URL } from '@/lib/site';
import { themeScript } from '@/lib/themeScript';
import { clientErrorScript } from '@/lib/clientErrorScript';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: 'en_AU',
    title: SITE.name,
    description: SITE.description,
  },
  twitter: { card: 'summary_large_image', title: SITE.name, description: SITE.description },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Added to the iPhone home screen, it opens as an app with the game's name.
  appleWebApp: { capable: true, title: 'Grazing Game', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a1120' },
    { media: '(prefers-color-scheme: light)', color: '#fffaf0' },
  ],
};

// Every app page is made for each request, so each gets its own nonce for the
// Content-Security-Policy (proxy.ts, lib/csp.ts). The public website pages are pages-router
// pages and stay static.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en-AU" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: clientErrorScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to the main content
        </a>
        {children}
      </body>
    </html>
  );
}
