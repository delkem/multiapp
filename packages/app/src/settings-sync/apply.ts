import * as fs from 'fs';
import * as Immutable from 'immutable';
import log from 'electron-log';
import { getDatabasePath } from '../database/database.prod';
import { archivePendingImport, readPendingImport, writeConfig } from './files';
import { LocalState, mergeSnapshotIntoLocal } from './snapshot';

/** Persisted slices written by an import, in a safe order (referenced data first) */
const SLICES: (keyof ReturnType<typeof mergeSnapshotIntoLocal>)[] = [
  'userIdentities', 'applicationSettings', 'applications', 'tabs', 'orderedTabs',
  'favorites', 'orderedFavorites', 'dock', 'subwindows', 'nav', 'app', 'onboarding',
];

const toPlain = (value: any) => (value && typeof value.toJS === 'function' ? value.toJS() : value);

const backupDatabase = () => {
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) return null;
  const backupPath = `${dbPath}.before-settings-import-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
};

/**
 * If a settings import was staged (see `stagePendingImport`), merge it into the
 * database before the app state is loaded. Called once at startup, after migrations.
 * Never throws: a failed import must not prevent the app from starting.
 */
export const applyPendingImport = async (backend: Record<string, any>) => {
  let snapshot;
  try {
    snapshot = readPendingImport();
  } catch (e) {
    log.error('[settings-sync] invalid pending import, ignoring', e);
    archivePendingImport('failed');
    return;
  }
  if (!snapshot) return;

  try {
    const backupPath = backupDatabase();
    log.info(`[settings-sync] applying settings from ${snapshot.exportedFrom} (${snapshot.exportedAt}), db backup: ${backupPath}`);

    const local: LocalState = {};
    for (const key of SLICES) {
      (local as any)[key] = toPlain(await backend[key].get());
    }

    const merged = mergeSnapshotIntoLocal(local, snapshot.data);

    for (const key of SLICES) {
      const value = Immutable.fromJS(merged[key]);
      const proxy = backend[key];
      // `favorites` is a custom proxy without `actualSet`; its `set` resolves once written
      await (proxy.actualSet ? proxy.actualSet(value) : proxy.set(value));
    }

    archivePendingImport('applied');
    writeConfig({ lastHash: snapshot.hash, lastSyncedAt: new Date().toISOString() });
    log.info('[settings-sync] settings import applied');
  } catch (e) {
    log.error('[settings-sync] settings import failed', e);
    archivePendingImport('failed');
  }
};
