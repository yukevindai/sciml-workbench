import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { themeBootScript } from './lib/theme';
import { motionBootScript } from './lib/motion';
import './globals.css';
import { MotionPreferences } from './components/motion-preferences';

/* Self-hosted at build time: the browser never contacts a font CDN, and the
   faces the design actually uses are the ones that load, so nothing is
   synthesised. IBM Plex was drawn for technical and scientific interfaces. */
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
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
