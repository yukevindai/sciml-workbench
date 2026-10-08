import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { themeBootScript } from './lib/theme';
import { motionBootScript } from './lib/motion';
import './globals.css';
import { MotionPreferences } from './components/motion-preferences';

/* Pinned Fontsource files keep clean builds independent of Google Fonts and
   its CSS loader. Bundle only the Latin faces the design uses; Next serves
   and preloads them from this deployment with the existing CSS variables. */
const sans = localFont({
  src: [
    { path: '../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SciML Workbench',
  description: 'Your personal AI lab group. Explore your data, evaluate models, and trace every result back to its evidence.',
};

export const viewport: Viewport = {
  themeColor: '#0b0b0c',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    /* The boot script sets data-theme before paint, so the server markup and
       the first client render differ by design on that one attribute. */
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript + motionBootScript }} />
      </head>
      <body><MotionPreferences>{children}</MotionPreferences></body>
    </html>
  );
}
