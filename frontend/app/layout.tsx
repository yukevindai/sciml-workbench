import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'SciML Workbench', description: 'Traceable scientific machine learning, from evidence to evaluation.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
