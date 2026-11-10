import { ServiceBase } from '../../lib/class';
import { service } from '../../lib/decorator';
import { RPC } from '../../lib/types';

export interface AppMetricsSummary {
  freeMemoryMB: number,
  processCount: number,
  // processMemorySumMB: number,
  // processMemoryMaxMB: number,
  // processMemoryMinMB: number,
  // processMemoryAvgMB: number,
}

/** One OS process, from `app.getAppMetrics()`. Memory in KB. */
export interface ProcessMemory {
  pid: number,
  /** Chromium process type: 'Browser', 'Tab', 'GPU', 'Utility', ... */
  type: string,
  /** e.g. 'Network Service' for utility processes */
  name?: string,
  workingSetKB: number,
  /** Windows only */
  privateKB?: number,
}

export interface WebContentsProcesses {
  webContentsId: number,
  /** 'window', 'webview', 'browserView', 'backgroundPage', 'remote' ... */
  type: string,
  url: string,
  /** Identifies the session within one snapshot */
  sessionKey: string,
  /** OS processes of the page and all of its frames (iframes can run in their own process) */
  pids: number[],
}

export interface SessionInfo {
  sessionKey: string,
  isDefault: boolean,
  runningServiceWorkers: number,
}

export interface MemorySnapshot {
  takenAt: string,
  processes: ProcessMemory[],
  webContents: WebContentsProcesses[],
  sessions: SessionInfo[],
}

@service('extended-app-metrics')
export class ExtendedAppMetricsService extends ServiceBase implements RPC.Interface<ExtendedAppMetricsService> {
  // @ts-ignore
  async getNumberOfWebContents(): Promise<number> {}
  // @ts-ignore
  async getAppMetricsSummary(): Promise<AppMetricsSummary> {}
  // @ts-ignore
  async getMemorySnapshot(): Promise<MemorySnapshot> {}
}
