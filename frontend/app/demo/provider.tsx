'use client';
import { DemoContext } from '../components/workspace-link';
export function DemoProvider({children}:{children:React.ReactNode}) {
  return <DemoContext.Provider value={true}>{children}</DemoContext.Provider>;
}
