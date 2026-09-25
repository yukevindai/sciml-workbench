import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { parseRunDetail, parseRunEvents } from './decode';
import type { RunDetail, RunEvent } from './generated/http';
import { isTerminalRun, runPollDelay } from './runs';

const READ_TIMEOUT = 30_000;
const EVENT_PAGE = 200;
/** While streaming, the run record is also re-read on this cadence for fields no event announces. */
export const STREAM_DETAIL_REFRESH = 15_000;
/** Matches the server's `retry: 2000`; slower in a hidden tab. */
const RECONNECT = 2_000;
const RECONNECT_HIDDEN = 15_000;
const EVENT_TYPES: RunEvent['event_type'][] = ['accepted', 'state_changed', 'plan_changed', 'action_changed', 'question_changed', 'usage_changed', 'result_published'];

export type Transport = 'connecting' | 'stream' | 'polling' | 'finished';

/** Merge by sequence. The server's event order is authoritative; replays never duplicate a row. */
export function mergeEvents(current: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const bySequence = new Map(current.map(event => [event.sequence, event]));
  for (const event of incoming) bySequence.set(event.sequence, event);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

/**
 * Ordered run events and the current run record. Events arrive over authenticated
 * SSE; the server replays a bounded batch after `after` and closes, and the client
 * reopens from its own cursor. If the stream cannot be opened (or EventSource is
 * missing), the same cursor is polled instead. Every path merges by sequence.
 */
export function useRunFeed(projectId: string, runId: string, disabled: boolean) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState('');
  const [lastRead, setLastRead] = useState('');
  const [transport, setTransport] = useState<Transport>('connecting');
  const [generation, setGeneration] = useState(0);
  const readNow = useRef<() => void>(() => undefined);

  useEffect(() => {
    setDetail(null); setEvents([]); setError(''); setLastRead(''); setTransport('connecting');
    if (!runId || !projectId || disabled) return;
    const pid = projectId;
    const base = `projects/${pid}/agent-runs/${runId}`;
    let disposed = false;
    let cursor = 0;
    let failures = 0;
    let terminal = false;
    let mode: 'stream' | 'polling' = 'stream';
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let detailTimer: ReturnType<typeof setTimeout> | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    let reading = false;
    let readAgain = false;

    const accept = (batch: RunEvent[]) => {
      if (batch.some(event => event.run_id !== runId)) throw new Error('The server returned events for a different run.');
      if (!batch.length) return;
      cursor = Math.max(cursor, ...batch.map(event => event.sequence));
      setEvents(current => mergeEvents(current, batch));
    };

    const finish = () => {
      terminal = true;
      source?.close(); source = null;
      clearTimeout(pollTimer); clearTimeout(detailTimer); clearTimeout(reopenTimer);
      setTransport('finished');
    };

    /** Reads the run record, and (when polling) the events after the cursor. Returns false on failure. */
    const read = async (withEvents: boolean): Promise<boolean> => {
      if (reading) { readAgain = true; return true; }
      reading = true;
      try {
        const next = await api(base, parseRunDetail, undefined, READ_TIMEOUT);
        if (disposed) return true;
        if (next.run.id !== runId || next.run.project_id !== pid) throw new Error('The server returned a different run.');
        // A terminal run's final events are always drained once, whichever transport delivered the rest.
        if (withEvents || isTerminalRun(next.run)) {
          for (let page = 0; page < 10; page += 1) {
            const batch = await api(`${base}/events?after=${cursor}&limit=${EVENT_PAGE}`, parseRunEvents, undefined, READ_TIMEOUT);
            if (disposed) return true;
            accept(batch);
            if (batch.length < EVENT_PAGE) break;
          }
        }
        setDetail(next);
        setLastRead(new Date().toISOString());
        setError('');
        failures = 0;
        if (isTerminalRun(next.run)) finish();
        return true;
      } catch (e) {
        if (disposed) return true;
        failures += 1;
        setError(e instanceof Error ? e.message : 'Could not read this run');
        return false;
      } finally {
        reading = false;
        if (readAgain && !disposed) { readAgain = false; void read(mode === 'polling'); }
      }
    };

    const hidden = () => document.visibilityState === 'hidden';
    const poll = async () => {
      if (disposed || terminal) return;
      clearTimeout(pollTimer);
      await read(true);
      if (!disposed && !terminal) pollTimer = setTimeout(() => void poll(), runPollDelay({ failures, hidden: hidden() }));
    };
    const scheduleDetail = (delay: number) => {
      clearTimeout(detailTimer);
      detailTimer = setTimeout(async () => {
        if (disposed || terminal || mode !== 'stream') return;
        await read(false);
        if (!disposed && !terminal && mode === 'stream') scheduleDetail(failures ? runPollDelay({ failures, hidden: false }) : STREAM_DETAIL_REFRESH);
      }, delay);
    };

    const fallBack = () => {
      if (mode === 'polling' || disposed || terminal) return;
      mode = 'polling';
      source?.close(); source = null;
      clearTimeout(detailTimer); clearTimeout(reopenTimer);
      setTransport('polling');
      void poll();
    };

    const open = () => {
      if (disposed || terminal || mode !== 'stream') return;
      if (typeof EventSource === 'undefined') { fallBack(); return; }
      // The client owns the cursor: each connection asks for events after the last one merged,
      // so a reconnect never depends on a proxy forwarding Last-Event-ID.
      const current = new EventSource(`/api/${base}/stream?after=${cursor}`);
      source = current;
      let opened = false;
      current.onopen = () => { opened = true; if (!disposed && !terminal) setTransport('stream'); };
      const onEvent = (message: MessageEvent) => {
        if (disposed) return;
        try {
          accept(parseRunEvents([JSON.parse(message.data)]));
          scheduleDetail(250);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The stream sent an invalid event.');
          fallBack();
        }
      };
      for (const type of EVENT_TYPES) current.addEventListener(type, onEvent as EventListener);
      // The server closes after each bounded replay. A connection that opened is reopened from the
      // cursor after the server's retry interval; one that never opened was refused, so poll instead.
      current.onerror = () => {
        current.close();
        if (source === current) source = null;
        if (disposed || terminal || mode !== 'stream') return;
        if (!opened) { fallBack(); return; }
        clearTimeout(reopenTimer);
        reopenTimer = setTimeout(open, hidden() ? RECONNECT_HIDDEN : RECONNECT);
      };
    };

    readNow.current = () => { void (mode === 'polling' ? poll() : read(false)); };
    const visible = () => { if (!hidden()) readNow.current(); };
    document.addEventListener('visibilitychange', visible);
    void read(false).then(() => { if (!disposed && !terminal) { open(); scheduleDetail(STREAM_DETAIL_REFRESH); } });
    return () => {
      disposed = true;
      source?.close();
      clearTimeout(pollTimer); clearTimeout(detailTimer); clearTimeout(reopenTimer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [projectId, runId, disabled, generation]);

  /** Re-reads the record now (after a control or answer); the event cursor is kept. */
  const refresh = useCallback(() => readNow.current(), []);
  /** Rebuilds the feed from sequence 0, for an explicit researcher retry. */
  const restart = useCallback(() => setGeneration(value => value + 1), []);
  return { detail, setDetail, events, error, lastRead, transport, refresh, restart };
}
