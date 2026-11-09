/**
 * Settings sync: pure snapshot logic (no Electron / IO).
 *
 * A snapshot holds the user's *configuration* (apps, dock + dividers, favorites,
 * per-app settings, account emails, a few general preferences) so it can be moved
 * between computers. It deliberately excludes:
 *  - OAuth access/refresh tokens and website logins (cookies): secrets, and cookies
 *    are encrypted per machine anyway
 *  - open non-home tabs, detached windows, usage stats, password managers
 *  - machine-specific settings (download folder, launch at startup)
 *
 * All functions take/return plain JS objects (i.e. `immutableState.toJS()` shapes
 * of the persisted redux slices).
 */
import { createHash } from 'crypto';
import { isDividerItem } from '../dock/dividers';

export const SNAPSHOT_FORMAT = 1;
export const SNAPSHOT_FILE_NAME = 'multiapp-settings.json';

type Dict<T = any> = Record<string, T>;

export interface SnapshotData {
  applications: Dict,
  homeTabs: Dict,
  dock: string[],
  favorites: Dict,
  orderedFavorites: Dict,
  applicationSettings: Dict,
  userIdentities: Dict,
  app: Dict,
  onboardingDone: boolean,
}

export interface SettingsSnapshot {
  format: number,
  exportedAt: string,
  exportedFrom: string,
  appVersion: string,
  hash: string,
  data: SnapshotData,
}

/** Plain-JS view of the persisted slices this module reads/writes */
export interface LocalState {
  applications?: Dict,
  tabs?: Dict,
  dock?: string[],
  favorites?: { favorites?: Dict },
  orderedFavorites?: Dict,
  orderedTabs?: Dict,
  applicationSettings?: Dict,
  userIdentities?: Dict,
  app?: Dict,
  onboarding?: Dict,
  nav?: Dict,
  subwindows?: string[],
}

const pick = (obj: Dict | undefined | null, keys: string[]): Dict => {
  const out: Dict = {};
  if (!obj) return out;
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
};

const mapValues = (obj: Dict | undefined | null, fn: (v: any, k: string) => any): Dict => {
  const out: Dict = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const mapped = fn(v, k);
    if (mapped !== undefined) out[k] = mapped;
  }
  return out;
};

const filterValues = (obj: Dict | undefined | null, fn: (v: any, k: string) => boolean): Dict =>
  mapValues(obj, (v, k) => (fn(v, k) ? v : undefined));

const APPLICATION_FIELDS = [
  'applicationId', 'manifestURL', 'installContext', 'activeTab', 'iconURL', 'serviceId',
  'notificationsEnabled', 'identityId', 'subdomain', 'customURL',
];
const TAB_FIELDS = ['applicationId', 'isApplicationHome', 'tabId', 'title', 'url', 'favicons', 'lastActivityAt'];
const FAVORITE_FIELDS = ['applicationId', 'favoriteId', 'title', 'url', 'favicons'];
const APPLICATION_SETTINGS_FIELDS = ['manifestURL', 'doNotInstall', 'alwaysLoaded', 'instanceLogoInDock'];
const PROFILE_FIELDS = ['displayName', 'email', 'imageURL'];
/** General preferences that make sense on every computer */
export const SYNCED_APP_FIELDS = ['hideMainMenu', 'minimizeToTray', 'promptDownload'];

const sanitizeIdentity = (identity: Dict) => {
  const out: Dict = pick(identity, ['identityId', 'provider', 'userId']);
  // leave `profileData` out entirely when absent: the identity persistence expects a value if the key exists
  if (identity.profileData) out.profileData = pick(identity.profileData, PROFILE_FIELDS);
  return out;
};

export const buildSnapshotData = (state: LocalState): SnapshotData => {
  const applications = mapValues(state.applications, app => pick(app, APPLICATION_FIELDS));
  const appIds = new Set(Object.keys(applications));

  return {
    applications,
    homeTabs: mapValues(
      filterValues(state.tabs, tab => Boolean(tab && tab.isApplicationHome) && appIds.has(tab.applicationId)),
      tab => pick(tab, TAB_FIELDS)
    ),
    dock: (state.dock || []).filter(item => isDividerItem(item) || appIds.has(item)),
    favorites: mapValues(
      filterValues(state.favorites && state.favorites.favorites, fav => appIds.has(fav && fav.applicationId)),
      fav => pick(fav, FAVORITE_FIELDS)
    ),
    orderedFavorites: filterValues(state.orderedFavorites, (_v, appId) => appIds.has(appId)),
    applicationSettings: mapValues(state.applicationSettings, s => pick(s, APPLICATION_SETTINGS_FIELDS)),
    userIdentities: mapValues(state.userIdentities, sanitizeIdentity),
    app: pick(state.app, SYNCED_APP_FIELDS),
    onboardingDone: Boolean(state.onboarding && state.onboarding.done),
  };
};

const stableStringify = (value: any): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      // null and missing are equivalent: the database turns `undefined` into NULL
      .filter(k => value[k] !== undefined && value[k] !== null)
      .map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
};

/**
 * Hash of the *meaningful* configuration only. Things that change during normal
 * browsing (active tab, home tab URL/title, favicons, profile pictures) are left
 * out so that just using the apps does not trigger a sync.
 */
export const hashSnapshotData = (data: SnapshotData): string => {
  const significant = {
    applications: mapValues(data.applications, app => {
      const { activeTab, iconURL, ...rest } = app;
      return rest;
    }),
    dock: data.dock,
    favorites: mapValues(data.favorites, fav => pick(fav, ['applicationId', 'favoriteId', 'url'])),
    orderedFavorites: data.orderedFavorites,
    applicationSettings: data.applicationSettings,
    userIdentities: mapValues(data.userIdentities, identity => ({
      ...pick(identity, ['identityId', 'provider', 'userId']),
      email: identity.profileData ? identity.profileData.email : null,
    })),
    app: data.app,
  };
  return createHash('sha1').update(stableStringify(significant)).digest('hex');
};

export const createSnapshot = (
  state: LocalState,
  meta: { exportedFrom: string, appVersion: string, now?: Date }
): SettingsSnapshot => {
  const data = buildSnapshotData(state);
  return {
    format: SNAPSHOT_FORMAT,
    exportedAt: (meta.now || new Date()).toISOString(),
    exportedFrom: meta.exportedFrom,
    appVersion: meta.appVersion,
    hash: hashSnapshotData(data),
    data,
  };
};

/** Parse and validate a snapshot file. Throws a user-readable Error when invalid. */
export const parseSnapshot = (text: string): SettingsSnapshot => {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('The settings file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('This is not a settings file.');
  }
  if (parsed.format !== SNAPSHOT_FORMAT) {
    throw new Error(`Unsupported settings file version (${parsed.format}). Update the app on this computer.`);
  }
  const d = parsed.data;
  const data: SnapshotData = {
    applications: d.applications || {},
    homeTabs: d.homeTabs || {},
    dock: Array.isArray(d.dock) ? d.dock.filter((i: any) => typeof i === 'string') : [],
    favorites: d.favorites || {},
    orderedFavorites: d.orderedFavorites || {},
    applicationSettings: d.applicationSettings || {},
    userIdentities: d.userIdentities || {},
    app: pick(d.app, SYNCED_APP_FIELDS),
    onboardingDone: Boolean(d.onboardingDone),
  };
  return {
    format: parsed.format,
    exportedAt: String(parsed.exportedAt || ''),
    exportedFrom: String(parsed.exportedFrom || 'another computer'),
    appVersion: String(parsed.appVersion || ''),
    // recompute: never trust the stored hash
    hash: hashSnapshotData(data),
    data,
  };
};

/**
 * Merge an imported snapshot into this computer's state.
 * Returns the full new value for every slice that must be written.
 *
 * Rules:
 *  - configuration (apps, dock, favorites, settings, identities) comes from the snapshot
 *  - apps that already exist here keep their tabs (open tabs, active tab) and
 *    identities keep their local tokens
 *  - machine-specific values (download folder, auto launch, version) stay local
 */
export const mergeSnapshotIntoLocal = (local: LocalState, data: SnapshotData) => {
  const localApps = local.applications || {};
  const localTabs = local.tabs || {};
  const appIds = new Set(Object.keys(data.applications));

  // tabs: keep local tabs of apps we still have, add imported home tabs for new apps
  const keptLocalTabs = filterValues(localTabs, tab => appIds.has(tab && tab.applicationId));
  const appsWithLocalHome = new Set(
    Object.values(keptLocalTabs).filter((t: any) => t.isApplicationHome).map((t: any) => t.applicationId)
  );
  const tabs: Dict = { ...keptLocalTabs };
  for (const [tabId, tab] of Object.entries(data.homeTabs)) {
    if (appIds.has(tab.applicationId) && !appsWithLocalHome.has(tab.applicationId) && !tabs[tabId]) {
      tabs[tabId] = { ...tab, isApplicationHome: true };
    }
  }
  const homeTabIdByApp: Dict<string> = {};
  for (const tab of Object.values(tabs)) {
    if (tab.isApplicationHome) homeTabIdByApp[tab.applicationId] = tab.tabId;
  }

  const applications = mapValues(data.applications, (app, appId) => {
    const localApp = localApps[appId];
    const candidates = [localApp && localApp.activeTab, app.activeTab, homeTabIdByApp[appId]];
    const activeTab = candidates.find(id => id && tabs[id] && tabs[id].applicationId === appId) || null;
    return { ...app, activeTab };
  });

  const userIdentities = mapValues(data.userIdentities, (identity, id) => {
    const localIdentity = (local.userIdentities || {})[id];
    return {
      ...identity,
      accessToken: localIdentity ? localIdentity.accessToken : undefined,
      refreshToken: localIdentity ? localIdentity.refreshToken : undefined,
    };
  });

  const dock = data.dock.filter(item => isDividerItem(item) || appIds.has(item));

  const localNav = local.nav || {};
  const firstApp = dock.find(item => !isDividerItem(item)) || null;
  const nav = {
    ...localNav,
    tabApplicationId: appIds.has(localNav.tabApplicationId) ? localNav.tabApplicationId : firstApp,
    previousTabApplicationId: appIds.has(localNav.previousTabApplicationId) ? localNav.previousTabApplicationId : null,
  };

  return {
    applications,
    tabs,
    dock,
    favorites: { favorites: filterValues(data.favorites, fav => appIds.has(fav && fav.applicationId)) },
    orderedFavorites: filterValues(data.orderedFavorites, (_v, appId) => appIds.has(appId)),
    orderedTabs: mapValues(
      filterValues(local.orderedTabs, (_v, appId) => appIds.has(appId)),
      entry => ({ ...entry, order: (entry.order || []).filter((tabId: string) => Boolean(tabs[tabId])) })
    ),
    applicationSettings: data.applicationSettings,
    userIdentities,
    app: { ...(local.app || {}), ...pick(data.app, SYNCED_APP_FIELDS) },
    onboarding: { ...(local.onboarding || {}), done: Boolean((local.onboarding || {}).done || data.onboardingDone) },
    nav,
    subwindows: (local.subwindows || []).filter(tabId => Boolean(tabs[tabId])),
  };
};

export type MergedState = ReturnType<typeof mergeSnapshotIntoLocal>;
