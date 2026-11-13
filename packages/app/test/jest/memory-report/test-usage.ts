import { computeMemoryUsage, formatMemory } from '../../../src/memory-report/usage';
import { MemorySnapshot, WebContentsProcesses } from '../../../src/services/services/extendedAppMetrics/interface';

const proc = (pid: number, mb: number, privateMb?: number) => ({
  pid,
  type: 'Tab',
  workingSetKB: mb * 1024,
  privateKB: privateMb === undefined ? undefined : privateMb * 1024,
});

const wc = (webContentsId: number, pids: number[]): WebContentsProcesses =>
  ({ webContentsId, type: 'webview', url: 'https://example.com/', sessionKey: 'default', pids });

// webContents id -> application id (undefined: Station's own windows)
const apps: Record<number, string | undefined> = { 1: undefined, 10: 'gmail', 11: 'gmail', 20: 'slack', 21: 'notion' };
const resolve = (w: WebContentsProcesses) => apps[w.webContentsId];

const snapshot = (privateMemory: boolean): MemorySnapshot => {
  const p = (pid: number, mb: number) => proc(pid, mb * 2, privateMemory ? mb : undefined);
  return {
    takenAt: '2026-11-12T00:00:00.000Z',
    processes: [
      p(100, 120), // main process, no page
      p(200, 80), // Station window
      p(300, 250), // Gmail tab 1
      p(301, 50), // Gmail iframe in its own process, also hosts a frame of the Station window
      p(302, 90), // Gmail tab 2
      p(500, 70), // shared by Slack and Notion
    ],
    webContents: [
      wc(1, [200, 301]),
      wc(10, [300, 301]),
      wc(11, [302]),
      wc(20, [500]),
      wc(21, [500]),
    ],
    sessions: [{ sessionKey: 'default', isDefault: true, runningServiceWorkers: 0 }],
  };
};

describe('computeMemoryUsage', () => {
  it('uses private memory when the OS reports it', () => {
    const usage = computeMemoryUsage(snapshot(true), resolve);
    expect(usage.totalKB).toBe((120 + 80 + 250 + 50 + 90 + 70) * 1024);
    // all Gmail tabs add up; a process shared with a non-app page is split evenly
    expect(usage.byApplicationId.gmail).toBe((250 + 25 + 90) * 1024);
    expect(usage.byApplicationId.slack).toBe(35 * 1024);
    expect(usage.byApplicationId.notion).toBe(35 * 1024);
  });

  it('falls back to the working set elsewhere', () => {
    const usage = computeMemoryUsage(snapshot(false), resolve);
    expect(usage.totalKB).toBe((120 + 80 + 250 + 50 + 90 + 70) * 2 * 1024);
    expect(usage.byApplicationId.slack).toBe(70 * 1024);
  });

  it('leaves out apps with no open page', () => {
    expect(computeMemoryUsage(snapshot(true), resolve).byApplicationId.calendar).toBeUndefined();
  });
});

describe('formatMemory', () => {
  it('formats MB and GB', () => {
    expect(formatMemory(850 * 1024)).toBe('850 MB');
    expect(formatMemory(1.25 * 1024 * 1024)).toBe('1.3 GB');
    expect(formatMemory(12.4 * 1024 * 1024)).toBe('12 GB');
  });
});
