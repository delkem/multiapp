import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as remote from '@electron/remote';
import log from 'electron-log';
import { SagaIterator } from 'redux-saga';
import { all, call, delay, fork, put, select } from 'redux-saga/effects';
import services from '../services/servicesManager';
import { REHYDRATION_COMPLETE } from '../store/duck';
import { takeEveryWitness } from '../utils/sagas';
import {
  CHOOSE_FOLDER, DISABLE, EXPORT_FILE, IMPORT_FILE, SYNC_NOW, setSyncStatus,
} from './duck';
import {
  getSnapshotPath, readConfig, readSnapshotFile, readSnapshotFromFolder, stagePendingImport, writeConfig,
  writeSnapshotFile,
} from './files';
import { createSnapshot, LocalState, SettingsSnapshot, SNAPSHOT_FILE_NAME } from './snapshot';

/** Redux slices that make up the synced configuration */
const SYNCED_SLICES = [
  'applications', 'tabs', 'dock', 'favorites', 'orderedFavorites', 'applicationSettings',
  'userIdentities', 'app', 'onboarding',
];
/** Slices whose changes should trigger a push (tabs change constantly while browsing) */
const WATCHED_SLICES = SYNCED_SLICES.filter(s => s !== 'tabs');

const TICK_MS = 5000;
const REMOTE_CHECK_EVERY_TICKS = 12; // ~1 minute

// session state
let dismissedRemoteHash: string | null = null;
let promptOpen = false;

const toPlain = (value: any) => (value && typeof value.toJS === 'function' ? value.toJS() : value);

const formatTime = (iso?: string | null) => {
  if (!iso) return 'an unknown time';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};

function* getLocalState(): SagaIterator {
  const state = yield select();
  const local: LocalState = {};
  for (const key of SYNCED_SLICES) {
    (local as any)[key] = toPlain(state.get(key));
  }
  return local;
}

function* makeSnapshot(): SagaIterator {
  const local: LocalState = yield call(getLocalState);
  return createSnapshot(local, { exportedFrom: os.hostname(), appVersion: remote.app.getVersion() });
}

function* reportStatus(message: string | null, isError: boolean = false): SagaIterator {
  const config = readConfig();
  yield put(setSyncStatus({ folder: config.folder, lastSyncedAt: config.lastSyncedAt, message, isError }));
}

function* reportError(prefix: string, e: any): SagaIterator {
  log.warn(`[settings-sync] ${prefix}`, e);
  yield call(reportStatus, `${prefix}: ${e && e.message ? e.message : e}`, true);
}

function* restartWithImport(snapshot: SettingsSnapshot): SagaIterator {
  stagePendingImport(snapshot);
  log.info(`[settings-sync] import staged from ${snapshot.exportedFrom}, relaunching`);
  remote.app.relaunch();
  yield call([services.electronApp, services.electronApp.quit]);
}

/** Write this computer's configuration to the sync folder (when it changed, or always when `force`). */
function* push(force: boolean = false): SagaIterator {
  const config = readConfig();
  if (!config.folder) return;

  const snapshot: SettingsSnapshot = yield call(makeSnapshot);
  if (!force && snapshot.hash === config.lastHash) return;

  let remoteSnapshot: SettingsSnapshot | null;
  try {
    remoteSnapshot = readSnapshotFromFolder(config.folder);
  } catch (e) {
    if (!force) {
      yield call(reportError, 'Could not read the settings file in the sync folder', e);
      return;
    }
    remoteSnapshot = null;
  }

  if (remoteSnapshot && remoteSnapshot.hash === snapshot.hash) {
    // already identical (e.g. same change made on both computers)
    writeConfig({ lastHash: snapshot.hash, lastSyncedAt: new Date().toISOString() });
    yield call(reportStatus, 'Up to date');
    return;
  }

  if (!force && remoteSnapshot && remoteSnapshot.hash !== config.lastHash) {
    // another computer changed the file since our last sync: never overwrite silently
    yield call(handleRemoteChange, remoteSnapshot);
    return;
  }

  try {
    if (!fs.existsSync(config.folder)) throw new Error(`folder not found (${config.folder})`);
    writeSnapshotFile(getSnapshotPath(config.folder), snapshot);
    writeConfig({ lastHash: snapshot.hash, lastSyncedAt: new Date().toISOString() });
    yield call(reportStatus, 'Settings saved to the sync folder');
  } catch (e) {
    yield call(reportError, 'Could not save settings to the sync folder', e);
  }
}

/** The sync folder holds settings that differ from what this computer last synced: ask what to do. */
function* handleRemoteChange(remoteSnapshot: SettingsSnapshot, { fromSetup = false }: { fromSetup?: boolean } = {}): SagaIterator {
  const config = readConfig();
  const localSnapshot: SettingsSnapshot = yield call(makeSnapshot);

  if (localSnapshot.hash === remoteSnapshot.hash) {
    writeConfig({ lastHash: remoteSnapshot.hash, lastSyncedAt: new Date().toISOString() });
    yield call(reportStatus, 'Up to date');
    return;
  }
  if (promptOpen || (!fromSetup && dismissedRemoteHash === remoteSnapshot.hash)) return;

  const localChanged = config.lastHash !== null && localSnapshot.hash !== config.lastHash;
  const detail = [
    `Saved from "${remoteSnapshot.exportedFrom}" on ${formatTime(remoteSnapshot.exportedAt)}.`,
    'Loading them restarts the app. Apps you have not used on this computer yet will ask you to sign in.',
    localChanged ? 'Changes made on this computer since the last sync will be replaced.' : '',
  ].filter(Boolean).join('\n\n');

  promptOpen = true;
  let response: number;
  try {
    ({ response } = yield call([remote.dialog, remote.dialog.showMessageBox], {
      type: 'question',
      title: 'Settings sync',
      message: fromSetup
        ? 'This folder already has settings from another computer. Load them on this computer?'
        : 'Your settings were changed on another computer. Load them on this computer?',
      detail,
      buttons: ['Load and Restart', fromSetup ? 'Replace Them With This Computer\'s' : 'Keep This Computer\'s', 'Later'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    }));
  } finally {
    promptOpen = false;
  }

  if (response === 0) {
    yield call(restartWithImport, remoteSnapshot);
  } else if (response === 1) {
    dismissedRemoteHash = null;
    yield call(push, true);
  } else {
    dismissedRemoteHash = remoteSnapshot.hash;
    yield call(reportStatus, 'Newer settings from another computer are waiting. Click "Sync Now" to load them.');
  }
}

/** Look at the sync folder; push when it is empty, ask when another computer changed it. */
function* checkRemote(
  { fromSetup = false, interactive = false }: { fromSetup?: boolean, interactive?: boolean } = {}
): SagaIterator {
  const config = readConfig();
  if (!config.folder) return;
  if (interactive) dismissedRemoteHash = null;

  let remoteSnapshot: SettingsSnapshot | null;
  try {
    if (!fs.existsSync(config.folder)) throw new Error(`folder not found (${config.folder}). Is Google Drive running?`);
    remoteSnapshot = readSnapshotFromFolder(config.folder);
  } catch (e) {
    yield call(reportError, 'Could not read the sync folder', e);
    return;
  }

  if (!remoteSnapshot) {
    yield call(push, true);
  } else if (remoteSnapshot.hash !== config.lastHash) {
    yield call(handleRemoteChange, remoteSnapshot, { fromSetup });
  } else {
    // remote unchanged: share any local change
    yield call(push, interactive);
    if (!interactive) yield call(reportStatus, 'Up to date');
  }
}

/** Polls the store for configuration changes (debounced) and the sync folder for remote changes. */
function* watchLoop(): SagaIterator {
  yield call(reportStatus, null);
  yield delay(3000); // let the app settle after startup
  yield call(checkRemote);

  let previous: any[] = [];
  let dirty = false;
  let tick = 0;
  while (true) {
    yield delay(TICK_MS);
    tick += 1;
    try {
      const state = yield select();
      const current = WATCHED_SLICES.map(key => state.get(key));
      const changed = previous.length > 0 && current.some((slice, i) => slice !== previous[i]);
      previous = current;

      if (changed) {
        dirty = true; // wait for one quiet tick before writing
      } else if (dirty) {
        dirty = false;
        yield call(push);
      }

      if (tick % REMOTE_CHECK_EVERY_TICKS === 0) {
        yield call(checkRemote);
      }
    } catch (e) {
      log.error('[settings-sync] watch loop error', e);
    }
  }
}

const guessGoogleDriveFolder = (): string | undefined => {
  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    const cloudStorage = path.join(os.homedir(), 'Library', 'CloudStorage');
    try {
      fs.readdirSync(cloudStorage)
        .filter(name => name.startsWith('GoogleDrive-'))
        .forEach(name => candidates.push(path.join(cloudStorage, name, 'My Drive')));
    } catch (e) { /* no Google Drive */ }
  } else if (process.platform === 'win32') {
    candidates.push('G:\\My Drive');
  }
  return candidates.find(p => fs.existsSync(p));
};

function* chooseFolder(): SagaIterator {
  const config = readConfig();
  const { canceled, filePaths } = yield call([remote.dialog, remote.dialog.showOpenDialog], {
    title: 'Choose a folder to sync settings through',
    message: 'Pick a folder that syncs between your computers, such as your Google Drive folder.',
    buttonLabel: 'Use This Folder',
    defaultPath: config.folder || guessGoogleDriveFolder() || os.homedir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths || !filePaths[0]) return;

  // a new folder means nothing has been synced with it yet
  writeConfig({ folder: filePaths[0], lastHash: null, lastSyncedAt: null });
  dismissedRemoteHash = null;
  yield call(checkRemote, { fromSetup: true, interactive: true });
}

function* disable(): SagaIterator {
  writeConfig({ folder: null, lastHash: null, lastSyncedAt: null });
  yield call(reportStatus, 'Sync turned off. The settings file in the folder was left in place.');
}

function* exportFile(): SagaIterator {
  const { canceled, filePath } = yield call([remote.dialog, remote.dialog.showSaveDialog], {
    title: 'Export settings',
    defaultPath: path.join(guessGoogleDriveFolder() || os.homedir(), SNAPSHOT_FILE_NAME),
    filters: [{ name: 'Settings', extensions: ['json'] }],
  });
  if (canceled || !filePath) return;
  try {
    const snapshot: SettingsSnapshot = yield call(makeSnapshot);
    writeSnapshotFile(filePath, snapshot);
    yield call(reportStatus, `Settings exported to ${filePath}`);
  } catch (e) {
    yield call(reportError, 'Export failed', e);
  }
}

function* importFile(): SagaIterator {
  const { canceled, filePaths } = yield call([remote.dialog, remote.dialog.showOpenDialog], {
    title: 'Import settings',
    defaultPath: guessGoogleDriveFolder() || os.homedir(),
    filters: [{ name: 'Settings', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || !filePaths[0]) return;

  let snapshot: SettingsSnapshot;
  try {
    snapshot = readSnapshotFile(filePaths[0]);
  } catch (e) {
    yield call(reportError, 'Import failed', e);
    return;
  }

  const { response } = yield call([remote.dialog, remote.dialog.showMessageBox], {
    type: 'question',
    title: 'Import settings',
    message: 'Replace this computer\'s apps and settings with the ones in this file?',
    detail: [
      `Saved from "${snapshot.exportedFrom}" on ${formatTime(snapshot.exportedAt)}.`,
      'The app will restart. A backup of the current settings is kept.',
    ].join('\n\n'),
    buttons: ['Import and Restart', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) yield call(restartWithImport, snapshot);
}

const safe = (worker: (...args: any[]) => SagaIterator, label: string) => function* (...args: any[]): SagaIterator {
  try {
    yield call(worker, ...args);
  } catch (e) {
    yield call(reportError, label, e);
  }
};

export default function* main(): SagaIterator {
  yield all([
    takeEveryWitness(REHYDRATION_COMPLETE, function* () { yield fork(watchLoop); }),
    takeEveryWitness(CHOOSE_FOLDER, safe(chooseFolder, 'Could not set up sync')),
    takeEveryWitness(DISABLE, safe(disable, 'Could not turn off sync')),
    takeEveryWitness(SYNC_NOW, safe(function* () { yield call(checkRemote, { interactive: true }); }, 'Sync failed')),
    takeEveryWitness(EXPORT_FILE, safe(exportFile, 'Export failed')),
    takeEveryWitness(IMPORT_FILE, safe(importFile, 'Import failed')),
  ]);
}
