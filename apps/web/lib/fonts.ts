import { Anton, JetBrains_Mono, Silkscreen } from 'next/font/google';

// Fonts are downloaded at build time and served from our own site (PRD 14.10).
// Shared by the game's layout (app router) and the public pages (pages router).
export const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-anton',
});
export const silkscreen = Silkscreen({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-silkscreen',
});
export const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

/** The class names that put the three font variables on the html element. */
export const fontVariables = `${anton.variable} ${silkscreen.variable} ${jetbrains.variable}`;
