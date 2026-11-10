import { buildMemoryReport, Owner } from '../../../src/memory-report/report';
import { MemorySnapshot, WebContentsProcesses } from '../../../src/services/services/extendedAppMetrics/interface';

const proc = (pid: number, type: string, mb: number, privateMb?: number, name?: string) => ({
  pid,
  type,
  name,
  workingSetKB: mb * 1024,
  privateKB: privateMb === undefined ? undefined : privateMb * 1024,
});

const wc = (webContentsId: number, sessionKey: string, pids: number[], type = 'webview', url = 'https://example.com/'):
  WebContentsProcesses => ({ webContentsId, type, url, sessionKey, pids });

// webContents id -> owner
const owners: Record<number, Owner> = {
  1: { key: 'station-ui', label: 'Station windows' },
  10: { key: 'app:gmail-work', label: 'Gmail (work)' },
  11: { key: 'app:gmail-work', label: 'Gmail (work)' }, // second tab of the same app
  20: { key: 'app:calendar', label: 'Calendar' },
  30: { key: 'app:slack', label: 'Slack' },
  31: { key: 'app:notion', label: 'Notion' },
};
const resolve = (w: WebContentsProcesses) => owners[w.webContentsId];

const snapshot: MemorySnapshot = {
  takenAt: '2026-11-10T00:00:00.000Z',
  processes: [
    proc(100, 'Browser', 150, 120),
    proc(101, 'GPU', 200, 180),
    proc(102, 'Utility', 40, 30, 'Network Service'),
    proc(200, 'Tab', 90, 80), // Station window
    proc(300, 'Tab', 300, 250), // Gmail tab 1
    proc(301, 'Tab', 60, 50), // Gmail iframe in its own process
    proc(302, 'Tab', 100, 90), // Gmail tab 2
    proc(400, 'Tab', 120, 100), // Calendar
    proc(500, 'Tab', 80, 70), // used by both Slack and Notion
    proc(600, 'Tab', 30, 25), // no page: e.g. a service worker
  ],
  webContents: [
    wc(1, 'default', [200], 'window', 'file:///main.html'),
    wc(10, 'session-2', [300, 301]),
    wc(11, 'session-2', [302]),
    wc(20, 'session-3', [400]),
    wc(30, 'default', [500]),
    wc(31, 'default', [500]),
  ],
  sessions: [
    { sessionKey: 'default', isDefault: true, runningServiceWorkers: 4 },
    { sessionKey: 'session-2', isDefault: false, runningServiceWorkers: 2 },
    { sessionKey: 'session-3', isDefault: false, runningServiceWorkers: 1 },
  ],
};

const rowFor = (report: ReturnType<typeof buildMemoryReport>, label: string) => {
  const row = report.rows.find(r => r.label === label);
  if (!row) throw new Error(`no row ${label}; rows: ${report.rows.map(r => r.label).join(', ')}`);
  return row;
};

describe('memory usage report', () => {
  const report = buildMemoryReport(snapshot, resolve);

  it('groups all tabs and iframe processes of one app', () => {
    const gmail = rowFor(report, 'Gmail (work)');
    expect(gmail.pids).toEqual([300, 301, 302]);
    expect(gmail.workingSetKB).toBe(460 * 1024);
    expect(gmail.privateKB).toBe(390 * 1024);
  });

  it('marks apps with their own session and counts that session\'s service workers', () => {
    expect(rowFor(report, 'Gmail (work)').session).toBe('own');
    expect(rowFor(report, 'Gmail (work)').serviceWorkers).toBe(2);
    expect(rowFor(report, 'Calendar').serviceWorkers).toBe(1);
  });

  it('puts a process used by several apps in one shared row, without per-app service workers', () => {
    const shared = rowFor(report, 'Shared by Notion, Slack');
    expect(shared.pids).toEqual([500]);
    expect(shared.session).toBe('shared');
    expect(shared.serviceWorkers).toBeUndefined();
    expect(report.sharedSessionServiceWorkers).toBe(4);
  });

  it('labels processes that host no app page', () => {
    expect(rowFor(report, 'Station main process').pids).toEqual([100]);
    expect(rowFor(report, 'GPU process').pids).toEqual([101]);
    expect(rowFor(report, 'Utility: Network Service').pids).toEqual([102]);
    expect(rowFor(report, 'Renderers with no open page (service workers, spare)').pids).toEqual([600]);
    expect(rowFor(report, 'Station windows').pids).toEqual([200]);
  });

  it('counts every process exactly once', () => {
    const pids = report.rows.flatMap(r => r.pids).sort((a, b) => a - b);
    expect(pids).toEqual(snapshot.processes.map(p => p.pid).sort((a, b) => a - b));
    expect(report.total.workingSetKB).toBe(1170 * 1024);
    expect(report.total.privateKB).toBe(995 * 1024);
  });

  it('lists apps before system processes, largest first', () => {
    const labels = report.rows.map(r => r.label);
    expect(labels.slice(0, 2)).toEqual(['Gmail (work)', 'Calendar']);
    expect(labels.indexOf('Station main process')).toBeGreaterThan(labels.indexOf('Shared by Notion, Slack'));
  });

  it('shows n/a for private memory where the OS does not report it', () => {
    const linux = buildMemoryReport({
      ...snapshot,
      processes: snapshot.processes.map(p => ({ ...p, privateKB: undefined })),
    }, resolve);
    expect(linux.total.privateKB).toBeUndefined();
    expect(linux.text).toMatch(/^TOTAL\s+\d+\s+n\/a\s+1170\.0/m);
  });

  it('renders a readable table', () => {
    expect(report.text).toContain('=== Memory usage report 2026-11-10T00:00:00.000Z ===');
    expect(report.text).toMatch(/^Gmail \(work\)\s+own\s+3\s+390\.0\s+460\.0\s+2\s+300 301 302$/m);
    expect(report.text).toMatch(/^TOTAL\s+10\s+995\.0\s+1170\.0/m);
    expect(report.text).toContain('Service workers running in the shared default session: 4');
  });
});
