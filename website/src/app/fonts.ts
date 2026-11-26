import { Playfair_Display, Red_Hat_Display } from 'next/font/google';

/**
 * Self-hosted by Next.js at build time (no request to Google from the browser, no layout shift).
 * Same families / weights / styles the old CSS @import loaded, so the look is unchanged.
 * Exposed as CSS variables; globals.css, tailwind.config.ts and AntdConfig read them.
 */
export const redHatDisplay = Red_Hat_Display({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-red-hat',
});

export const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-playfair',
});
