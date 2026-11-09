import * as fs from 'fs';
import * as path from 'path';
import * as electron from 'electron';
import * as remote from '@electron/remote';
import { parseSnapshot, SettingsSnapshot, SNAPSHOT_FILE_NAME } from './snapshot';

/** Per-computer sync configuration. Never synced itself. */
export interface SyncConfig {
  folder: string | null,
  /** hash of the configuration last written to / loaded from the sync folder */
  lastHash: string | null,
  lastSyncedAt: string | null,
}

const CONFIG_FILE = 'settings-sync.json';
const PENDING_IMPORT_FILE = 'pending-settings-import.json';

const getApp = () => (process.type === 'renderer' ? remote.app : electron.app);
export const getUserDataPath = () => getApp().getPath('userData');

const DEFAULT_CONFIG: SyncConfig = { folder: null, lastHash: null, lastSyncedAt: null };

export const readConfig = (): SyncConfig => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(getUserDataPath(), CONFIG_FILE), 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
};

export const writeConfig = (patch: Partial<SyncConfig>): SyncConfig => {
  const next = { ...readConfig(), ...patch };
  writeFileAtomic(path.join(getUserDataPath(), CONFIG_FILE), JSON.stringify(next, null, 2));
  return next;
};

/** Write via a temp file + rename so a reader (or Google Drive) never sees a half-written file */
export const writeFileAtomic = (filePath: string, content: string) => {
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
};

export const getSnapshotPath = (folder: string) => path.join(folder, SNAPSHOT_FILE_NAME);

/** Returns null when the folder has no settings file yet. Throws on unreadable/invalid files. */
export const readSnapshotFromFolder = (folder: string): SettingsSnapshot | null => {
  const filePath = getSnapshotPath(folder);
  if (!fs.existsSync(filePath)) return null;
  return readSnapshotFile(filePath);
};

export const readSnapshotFile = (filePath: string): SettingsSnapshot =>
  parseSnapshot(fs.readFileSync(filePath, 'utf8'));

export const writeSnapshotFile = (filePath: string, snapshot: SettingsSnapshot) =>
  writeFileAtomic(filePath, JSON.stringify(snapshot, null, 2));

// --- pending import (applied on next launch, before state is loaded)

const pendingImportPath = () => path.join(getUserDataPath(), PENDING_IMPORT_FILE);

export const stagePendingImport = (snapshot: SettingsSnapshot) =>
  writeFileAtomic(pendingImportPath(), JSON.stringify(snapshot));

export const readPendingImport = (): SettingsSnapshot | null => {
  const filePath = pendingImportPath();
  if (!fs.existsSync(filePath)) return null;
  return readSnapshotFile(filePath);
};

/** Move the pending import out of the way so it is never applied twice */
export const archivePendingImport = (suffix: 'applied' | 'failed') => {
  const filePath = pendingImportPath();
  if (fs.existsSync(filePath)) {
    fs.renameSync(filePath, `${filePath}.${suffix}`);
  }
};
