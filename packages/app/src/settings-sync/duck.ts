import * as Immutable from 'immutable';

// Not persisted: the source of truth is the per-computer `settings-sync.json` (see ./files)

export const CHOOSE_FOLDER = 'browserX/settingsSync/CHOOSE_FOLDER';
export const DISABLE = 'browserX/settingsSync/DISABLE';
export const SYNC_NOW = 'browserX/settingsSync/SYNC_NOW';
export const EXPORT_FILE = 'browserX/settingsSync/EXPORT_FILE';
export const IMPORT_FILE = 'browserX/settingsSync/IMPORT_FILE';
export const SET_STATUS = 'browserX/settingsSync/SET_STATUS';

export interface SettingsSyncStatus {
  folder?: string | null,
  lastSyncedAt?: string | null,
  message?: string | null,
  isError?: boolean,
}

export const chooseSyncFolder = () => ({ type: CHOOSE_FOLDER });
export const disableSync = () => ({ type: DISABLE });
export const syncNow = () => ({ type: SYNC_NOW });
export const exportSettingsFile = () => ({ type: EXPORT_FILE });
export const importSettingsFile = () => ({ type: IMPORT_FILE });
export const setSyncStatus = (status: SettingsSyncStatus) => ({ type: SET_STATUS, status });

type Action = { type: typeof SET_STATUS, status: SettingsSyncStatus } | { type: string, status?: undefined };

const initialState = Immutable.Map({
  folder: null,
  lastSyncedAt: null,
  message: null,
  isError: false,
});

export default function reducer(state: Immutable.Map<string, any> = initialState, action: Action) {
  if (action.type === SET_STATUS && action.status) {
    return state.merge(action.status);
  }
  return state;
}

export const getSettingsSync = (state: any): SettingsSyncStatus =>
  (state.get('settingsSync') || initialState).toJS();
