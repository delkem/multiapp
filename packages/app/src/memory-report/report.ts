import {
  MemorySnapshot,
  ProcessMemory,
  WebContentsProcesses,
} from '../services/services/extendedAppMetrics/interface';

/** Who a web page belongs to. Pages with the same key (e.g. all tabs of one app) are grouped. */
export interface Owner {
  key: string,
  label: string,
}

export type ResolveOwner = (wc: WebContentsProcesses) => Owner;

export interface ReportRow {
  label: string,
  /** 'own' (isolated session), 'shared' (default session), 'mixed', or '-' for non-page processes */
  session: string,
  pids: number[],
  workingSetKB: number,
  /** undefined when the OS doesn't report private memory (only Windows does) */
  privateKB?: number,
  /** service workers running in the app's own session(s) */
  serviceWorkers?: number,
}

export interface MemoryReport {
  rows: ReportRow[],
  total: ReportRow,
  sharedSessionServiceWorkers: number,
  text: string,
}

const systemLabel = (p: ProcessMemory) => {
  switch (p.type) {
    case 'Browser': return 'Station main process';
    case 'GPU': return 'GPU process';
    case 'Utility': return `Utility: ${p.name || 'unknown'}`;
    // a renderer that hosts no open page: service workers, spare/preloading renderers
    case 'Tab': return 'Renderers with no open page (service workers, spare)';
    default: return `${p.type} process`;
  }
};

const sumPrivate = (processes: ProcessMemory[]) =>
  processes.every(p => typeof p.privateKB === 'number')
    ? processes.reduce((s, p) => s + p.privateKB!, 0)
    : undefined;

const toRow = (label: string, session: string, processes: ProcessMemory[], serviceWorkers?: number): ReportRow => ({
  label,
  session,
  pids: processes.map(p => p.pid).sort((a, b) => a - b),
  workingSetKB: processes.reduce((s, p) => s + p.workingSetKB, 0),
  privateKB: sumPrivate(processes),
  serviceWorkers,
});

/**
 * Groups every OS process of the app by the app (or system role) it belongs to.
 * Each process is counted exactly once: a process used by pages of several apps
 * gets its own "Shared by ..." row.
 */
export function buildMemoryReport(snapshot: MemorySnapshot, resolveOwner: ResolveOwner): MemoryReport {
  const sessionIsDefault = new Map(snapshot.sessions.map(s => [s.sessionKey, s.isDefault]));
  const sessionWorkers = new Map(snapshot.sessions.map(s => [s.sessionKey, s.runningServiceWorkers]));

  const ownersByPid = new Map<number, Map<string, Owner>>();
  const sessionsByOwner = new Map<string, Set<string>>();
  for (const wc of snapshot.webContents) {
    const owner = resolveOwner(wc);
    if (!sessionsByOwner.has(owner.key)) sessionsByOwner.set(owner.key, new Set());
    sessionsByOwner.get(owner.key)!.add(wc.sessionKey);
    for (const pid of wc.pids) {
      if (!ownersByPid.has(pid)) ownersByPid.set(pid, new Map());
      ownersByPid.get(pid)!.set(owner.key, owner);
    }
  }

  const groups = new Map<string, { label: string, ownerKeys: string[], processes: ProcessMemory[], isPage: boolean }>();
  for (const p of snapshot.processes) {
    const owners = [...(ownersByPid.get(p.pid) || new Map<string, Owner>()).values()]
      .sort((a, b) => a.key.localeCompare(b.key));
    let key: string;
    let label: string;
    if (owners.length === 1) {
      key = `owner:${owners[0].key}`;
      label = owners[0].label;
    } else if (owners.length > 1) {
      key = `shared:${owners.map(o => o.key).join('|')}`;
      label = `Shared by ${owners.map(o => o.label).join(', ')}`;
    } else {
      label = systemLabel(p);
      key = `system:${label}`;
    }
    if (!groups.has(key)) {
      groups.set(key, { label, ownerKeys: owners.map(o => o.key), processes: [], isPage: owners.length > 0 });
    }
    groups.get(key)!.processes.push(p);
  }

  const pageRows: ReportRow[] = [];
  const systemRows: ReportRow[] = [];
  for (const group of groups.values()) {
    if (!group.isPage) {
      systemRows.push(toRow(group.label, '-', group.processes));
      continue;
    }
    const sessionKeys = new Set<string>();
    group.ownerKeys.forEach(k => (sessionsByOwner.get(k) || new Set()).forEach(s => sessionKeys.add(s)));
    const kinds = new Set([...sessionKeys].map(s => (sessionIsDefault.get(s) ? 'shared' : 'own')));
    const session = kinds.size === 1 ? [...kinds][0] : 'mixed';
    // service workers of the shared default session can't be attributed to one app
    const ownSessionWorkers = [...sessionKeys]
      .filter(s => !sessionIsDefault.get(s))
      .reduce((n, s) => n + (sessionWorkers.get(s) || 0), 0);
    pageRows.push(toRow(group.label, session, group.processes, session === 'shared' ? undefined : ownSessionWorkers));
  }

  const bySize = (a: ReportRow, b: ReportRow) =>
    ((b.privateKB ?? b.workingSetKB) - (a.privateKB ?? a.workingSetKB)) || a.label.localeCompare(b.label);
  pageRows.sort(bySize);
  systemRows.sort(bySize);
  const rows = [...pageRows, ...systemRows];

  const total = toRow('TOTAL', '', snapshot.processes);
  const sharedSessionServiceWorkers = snapshot.sessions
    .filter(s => s.isDefault)
    .reduce((n, s) => n + s.runningServiceWorkers, 0);

  return { rows, total, sharedSessionServiceWorkers, text: formatReport(snapshot, rows, total, sharedSessionServiceWorkers) };
}

const mb = (kb?: number) => (typeof kb === 'number' ? (kb / 1024).toFixed(1) : 'n/a');

function formatReport(snapshot: MemorySnapshot, rows: ReportRow[], total: ReportRow, sharedWorkers: number) {
  const labelWidth = Math.min(60, Math.max(16, ...rows.map(r => r.label.length)));
  const fit = (s: string) => (s.length > labelWidth ? `${s.slice(0, labelWidth - 1)}…` : s.padEnd(labelWidth));
  const line = (label: string, session: string, procs: string, priv: string, ws: string, sw: string, pids: string) =>
    `${fit(label)}  ${session.padEnd(7)}  ${procs.padStart(5)}  ${priv.padStart(10)}  ${ws.padStart(14)}  ${sw.padStart(15)}  ${pids}`;

  return [
    `=== Memory usage report ${snapshot.takenAt} ===`,
    'Private MB: memory used only by those processes (reported on Windows only).',
    'Working set MB: RAM in use including memory shared between processes, so its total overcounts.',
    'Session: "own" = the app has its own login session, "shared" = it uses the shared default session.',
    '',
    line('App / process', 'Session', 'Procs', 'Private MB', 'Working set MB', 'Service workers', 'PIDs'),
    ...rows.map(r => line(
      r.label, r.session, String(r.pids.length), mb(r.privateKB), mb(r.workingSetKB),
      typeof r.serviceWorkers === 'number' ? String(r.serviceWorkers) : '-', r.pids.join(' ')
    )),
    line(total.label, '', String(total.pids.length), mb(total.privateKB), mb(total.workingSetKB), '', ''),
    '',
    `Service workers running in the shared default session: ${sharedWorkers}`,
    '=== end of memory usage report ===',
  ].join('\n');
}
