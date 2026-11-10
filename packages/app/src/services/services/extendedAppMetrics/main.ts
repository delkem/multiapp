import { app, session, Session, webContents } from 'electron';
import { RPC } from '../../lib/types';
import { ExtendedAppMetricsService, MemorySnapshot, ProcessMemory, SessionInfo, WebContentsProcesses } from './interface';

export class ExtendedAppMetricsServiceImpl extends ExtendedAppMetricsService implements RPC.Interface<ExtendedAppMetricsService> {

  async getNumberOfWebContents() {
    await app.whenReady();
    return webContents.getAllWebContents().length;
  }

  async getAppMetricsSummary() {
    await app.whenReady();
    const appMetrics = app.getAppMetrics();
    // TODO: See https://electronjs.org/docs/api/process#processgetprocessmemoryinfo
    // to replace deprecated behaviour.
    // const appMetricsMemoryMB = appMetrics.map(m => ((m as any).memory.workingSetSize / 1024));

    const systemMemoryInfo = process.getSystemMemoryInfo();

    return {
      freeMemoryMB: (systemMemoryInfo.free / 1024),
      processCount: appMetrics.length,
      // processMemorySumMB: sum(appMetricsMemoryMB),
      // processMemoryMaxMB: Math.max(...appMetricsMemoryMB),
      // processMemoryMinMB: Math.min(...appMetricsMemoryMB),
      // processMemoryAvgMB: mean(appMetricsMemoryMB),
    };
  }

  async getMemorySnapshot(): Promise<MemorySnapshot> {
    await app.whenReady();

    const processes: ProcessMemory[] = app.getAppMetrics().map(m => ({
      pid: m.pid,
      type: m.type,
      name: m.name || m.serviceName,
      workingSetKB: m.memory.workingSetSize,
      privateKB: m.memory.privateBytes,
    }));

    const sessionKeys = new Map<Session, string>();
    const keyFor = (sess: Session) => {
      if (!sessionKeys.has(sess)) {
        sessionKeys.set(sess, sess === session.defaultSession ? 'default' : `session-${sessionKeys.size + 1}`);
      }
      return sessionKeys.get(sess)!;
    };
    keyFor(session.defaultSession);

    const contents: WebContentsProcesses[] = [];
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      const pids = new Set<number>([wc.getOSProcessId()]);
      try {
        for (const frame of wc.mainFrame.framesInSubtree) {
          if (frame.osProcessId) pids.add(frame.osProcessId);
        }
      } catch {
        // the frame tree can go away while we walk it (page navigating or closing)
      }
      contents.push({
        webContentsId: wc.id,
        type: wc.getType(),
        url: wc.getURL(),
        sessionKey: keyFor(wc.session),
        pids: [...pids].filter(Boolean),
      });
    }

    const sessions: SessionInfo[] = [...sessionKeys.entries()].map(([sess, sessionKey]) => ({
      sessionKey,
      isDefault: sess === session.defaultSession,
      runningServiceWorkers: Object.keys(sess.serviceWorkers.getAllRunning()).length,
    }));

    return {
      takenAt: new Date().toISOString(),
      processes,
      webContents: contents,
      sessions,
    };
  }
}
