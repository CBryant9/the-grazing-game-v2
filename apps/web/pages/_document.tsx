import { Html, Head, Main, NextScript } from 'next/document';
import { fontVariables } from '@/lib/fonts';
import { themeScript } from '@/lib/themeScript';
import { themeToggleScript } from '@/lib/themeToggleScript';

// The document for the public website pages (the pages router). The game lives
// in the app router, with its own layout (app/layout.tsx).
export default function Document() {
  return (
    <Html lang="en-AU" className={fontVariables}>
      <Head>
        <meta name="application-name" content="The Grazing Game" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a1120" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fffaf0" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/icon-192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </Head>
      <body>
        <a className="skip-link" href="#main">
          Skip to the main content
        </a>
        <Main />
        <NextScript />
        <script dangerouslySetInnerHTML={{ __html: themeToggleScript }} />
      </body>
    </Html>
  );
}
