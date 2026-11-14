import type { AppProps } from 'next/app';
import Head from 'next/head';
// The fonts are used by the document's class names; importing them here makes the build preload them.
import '@/lib/fonts';
import '../app/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
