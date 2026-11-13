import log from 'electron-log';
import * as React from 'react';

import services from '../services/servicesManager';
import { MemorySnapshot } from '../services/services/extendedAppMetrics/interface';

/**
 * Renderer-side poller of the main process memory snapshot. It only runs
 * while something on screen subscribes, and skips polls while the window is
 * hidden (e.g. minimized to tray), so it costs nothing when nobody looks.
 */
const POLL_INTERVAL_MS = 5000;
/** A new subscriber (e.g. the app popup opening) reuses a snapshot this fresh */
const FRESH_MS = 1500;

type Listener = (snapshot: MemorySnapshot) => void;

const listeners = new Set<Listener>();
let latest: MemorySnapshot | undefined;
let latestAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let inFlight = false;

const poll = async () => {
  if (inFlight || listeners.size === 0) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  inFlight = true;
  try {
    latest = await services.extendedAppMetrics.getMemorySnapshot();
    latestAt = Date.now();
    listeners.forEach(listener => listener(latest!));
  } catch (e) {
    log.warn('[memory] could not get memory snapshot', e);
  } finally {
    inFlight = false;
  }
};

export function subscribeMemorySnapshot(listener: Listener): () => void {
  listeners.add(listener);
  if (latest) listener(latest);
  if (!timer) timer = setInterval(poll, POLL_INTERVAL_MS);
  if (Date.now() - latestAt > FRESH_MS) poll().catch(() => {});

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The latest memory snapshot, refreshed every few seconds while mounted. */
export function useMemorySnapshot(): MemorySnapshot | undefined {
  const [snapshot, setSnapshot] = React.useState<MemorySnapshot | undefined>(latest);
  React.useEffect(() => subscribeMemorySnapshot(setSnapshot), []);
  return snapshot;
}
