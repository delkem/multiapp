import * as fs from 'fs';
import * as path from 'path';
import * as electron from 'electron';
import log from 'electron-log';

/**
 * Settings that must be known before the app's database is available,
 * i.e. at the very start of the main process. They live in a small JSON
 * file in `userData` that both the main process and renderers can read.
 */
export interface LaunchSettings {
  /**
   * When true, launching the app while it is already running focuses the
   * existing window instead of starting a second instance.
   */
  singleInstance: boolean,
}

export const DEFAULT_LAUNCH_SETTINGS: LaunchSettings = {
  singleInstance: true,
};

const FILENAME = 'launch-settings.json';

const getApp = (): Electron.App =>
  process.type === 'renderer' ? require('@electron/remote').app : electron.app;

export const getLaunchSettingsPath = () => path.join(getApp().getPath('userData'), FILENAME);

export const readLaunchSettings = (filepath: string = getLaunchSettingsPath()): LaunchSettings => {
  try {
    const raw = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    return {
      ...DEFAULT_LAUNCH_SETTINGS,
      ...(typeof raw?.singleInstance === 'boolean' ? { singleInstance: raw.singleInstance } : {}),
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('[launch-settings] could not read settings, using defaults', e);
    }
    return { ...DEFAULT_LAUNCH_SETTINGS };
  }
};

export const writeLaunchSettings = (
  patch: Partial<LaunchSettings>,
  filepath: string = getLaunchSettingsPath(),
): LaunchSettings => {
  const next = { ...readLaunchSettings(filepath), ...patch };
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(next, null, 2));
  return next;
};
