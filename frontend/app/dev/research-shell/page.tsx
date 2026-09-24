import { notFound } from 'next/navigation';
import Workbench from '../../workbench';
import { Badge, Panel } from '../../components/ui';
import { EXECUTION_STATUS } from '../../lib/status';
import { shellFixture } from './fixtures';

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { state } = await searchParams;
  return <Workbench key={state ?? 'ready'} view="research" fixture={shellFixture(state === 'empty')}>
    <Panel title="Development status vocabulary" description="Display samples only. These are not live runs or controls.">
      <ul className="stack">
        {Object.entries(EXECUTION_STATUS).map(([state, display]) => (
          <li key={state}><Badge state={state} /> <span>{display.description}</span></li>
        ))}
      </ul>
    </Panel>
  </Workbench>;
}
