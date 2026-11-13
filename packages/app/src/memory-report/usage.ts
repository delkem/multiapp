import { getApplicationId } from '../applications/get';
import {
  MemorySnapshot,
  ProcessMemory,
  WebContentsProcesses,
} from '../services/services/extendedAppMetrics/interface';
import { getTabWebcontentsByWebContentsId, getWebcontentsTabId } from '../tab-webcontents/selectors';
import { getApplicationByTabId } from '../tabs/selectors';
import { StationState } from '../types';

/** The application a web page belongs to, or undefined for Station's own windows and stray pages. */
export const getWebContentsApplicationId = (state: StationState, wc: WebContentsProcesses): string | undefined => {
  const twc = getTabWebcontentsByWebContentsId(state, wc.webContentsId);
  const tabId = twc && getWebcontentsTabId(twc);
  const application = tabId ? getApplicationByTabId(state, tabId) : null;
  return application ? getApplicationId(application) : undefined;
};

/**
 * Memory of one process as shown to the user. Windows reports private memory
 * (not shared with other processes), which is closest to what the process
 * really costs; other OSes only give the working set.
 */
export const processMemoryKB = (p: ProcessMemory) =>
  typeof p.privateKB === 'number' ? p.privateKB : p.workingSetKB;

export interface MemoryUsage {
  /** Every process of the app: main, GPU, utilities, Station's windows and all apps */
  totalKB: number,
  /** By application id. A process shared by several pages is split evenly between them. */
  byApplicationId: { [applicationId: string]: number },
}

export function computeMemoryUsage(
  snapshot: MemorySnapshot,
  resolveApplicationId: (wc: WebContentsProcesses) => string | undefined,
): MemoryUsage {
  // pid -> owners of the pages it hosts ('app:<id>' or 'other:<webContentsId>')
  const ownersByPid = new Map<number, Set<string>>();
  for (const wc of snapshot.webContents) {
    const applicationId = resolveApplicationId(wc);
    const owner = applicationId ? `app:${applicationId}` : `other:${wc.webContentsId}`;
    for (const pid of wc.pids) {
      if (!ownersByPid.has(pid)) ownersByPid.set(pid, new Set());
      ownersByPid.get(pid)!.add(owner);
    }
  }

  let totalKB = 0;
  const byApplicationId: { [applicationId: string]: number } = {};
  for (const p of snapshot.processes) {
    const kb = processMemoryKB(p);
    totalKB += kb;
    const owners = ownersByPid.get(p.pid);
    if (!owners) continue;
    const share = kb / owners.size;
    owners.forEach(owner => {
      if (!owner.startsWith('app:')) return;
      const applicationId = owner.slice('app:'.length);
      byApplicationId[applicationId] = (byApplicationId[applicationId] || 0) + share;
    });
  }

  return { totalKB, byApplicationId };
}

/** "850 MB", "1.2 GB", "12 GB" */
export function formatMemory(kb: number): string {
  const mb = kb / 1024;
  if (mb < 1000) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}
