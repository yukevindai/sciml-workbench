import { DemoProvider } from './provider';

export const metadata = { title: 'Interactive demo · SciML Workbench', description: 'Explore the real research workspace with synthetic sample data and scripted responses. No account or AI calls required.' };
export default function DemoLayout({children}:{children:React.ReactNode}) {
  return <DemoProvider>{children}</DemoProvider>;
}
