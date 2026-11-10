import { app, BrowserWindow } from 'electron';
import { ExtendedAppMetricsServiceImpl } from '../../../src/services/services/extendedAppMetrics/main';

// Runs against the real Electron APIs (jest runs in Electron's main process).
describe('memory snapshot', () => {
  let win: BrowserWindow;

  beforeAll(async () => {
    await app.whenReady();
    win = new BrowserWindow({
      show: false,
      webPreferences: { partition: `persist:memory-snapshot-test-${Date.now()}` },
    });
    await win.loadURL('data:text/html,<p>memory snapshot test</p>');
  });

  afterAll(() => {
    if (win && !win.isDestroyed()) win.destroy();
  });

  it('reports processes, pages and sessions', async () => {
    const snapshot = await new ExtendedAppMetricsServiceImpl().getMemorySnapshot();

    expect(snapshot.processes.length).toBeGreaterThan(0);
    expect(snapshot.processes.some(p => p.type === 'Browser')).toBe(true);
    for (const p of snapshot.processes) {
      expect(p.workingSetKB).toBeGreaterThan(0);
    }

    const page = snapshot.webContents.find(w => w.webContentsId === win.webContents.id)!;
    expect(page).toBeDefined();
    expect(page.pids).toContain(win.webContents.getOSProcessId());
    // every page process is a process Electron reports
    const pids = new Set(snapshot.processes.map(p => p.pid));
    page.pids.forEach(pid => expect(pids.has(pid)).toBe(true));

    // the window uses its own partition, not the default session
    const pageSession = snapshot.sessions.find(s => s.sessionKey === page.sessionKey)!;
    expect(pageSession.isDefault).toBe(false);
    expect(snapshot.sessions.filter(s => s.isDefault)).toHaveLength(1);
  });
});
