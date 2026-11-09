import * as Immutable from 'immutable';
import { createDividerItem } from '../../../src/dock/dividers';
import getBackend from '../../../src/persistence/local.backend';
import umzug from '../../../src/persistence/umzug';
import { createSnapshot, hashSnapshotData, buildSnapshotData, SettingsSnapshot } from '../../../src/settings-sync/snapshot';

// --- IO mocks: the pending import file and sync config live in the user data folder
let pending: SettingsSnapshot | null = null;
const archived: string[] = [];
const configWrites: any[] = [];
jest.mock('../../../src/settings-sync/files', () => ({
  readPendingImport: () => pending,
  archivePendingImport: (suffix: string) => { archived.push(suffix); pending = null; },
  writeConfig: (patch: any) => { configWrites.push(patch); return patch; },
}));
jest.mock('../../../src/database/database.prod', () => ({
  getDatabasePath: () => '/nonexistent/station.db',
}));

// imported after the mocks
import { applyPendingImport } from '../../../src/settings-sync/apply';

const SLICES = ['applications', 'tabs', 'dock', 'favorites', 'orderedFavorites', 'applicationSettings',
  'userIdentities', 'app', 'onboarding', 'nav', 'orderedTabs', 'subwindows'];

const readAll = async () => {
  // fresh proxies: read what is really in the database, not cached instances
  const backend: any = getBackend();
  const out: any = {};
  for (const key of SLICES) {
    const value = await backend[key].get();
    out[key] = value && value.toJS ? value.toJS() : value;
  }
  return out;
};

const divider = createDividerItem('d1', 'Work');

// computer A: the source of the snapshot
const sourceState = {
  applications: {
    gmail1: { applicationId: 'gmail1', manifestURL: 'station-manifest://14', identityId: 'id-work', activeTab: 'gmail1-home', notificationsEnabled: true },
    slack: { applicationId: 'slack', manifestURL: 'station-manifest://21', activeTab: 'slack-home', installContext: { origin: 'appstore' } },
  },
  tabs: {
    'gmail1-home': { tabId: 'gmail1-home', applicationId: 'gmail1', isApplicationHome: true, url: 'https://mail.google.com/', title: 'Inbox', favicons: ['https://x/fav.ico'] },
    'slack-home': { tabId: 'slack-home', applicationId: 'slack', isApplicationHome: true, url: 'https://app.slack.com/' },
  },
  dock: ['gmail1', divider, 'slack'],
  favorites: { favorites: { f1: { favoriteId: 'f1', applicationId: 'slack', title: 'General', url: 'https://app.slack.com/general' } } },
  orderedFavorites: { slack: { applicationId: 'slack', order: ['f1'] } },
  applicationSettings: { 'station-manifest://14': { manifestURL: 'station-manifest://14', alwaysLoaded: true, instanceLogoInDock: true } },
  userIdentities: {
    'id-work': { identityId: 'id-work', provider: 'google', userId: 'u1', accessToken: 'SOURCE-SECRET', profileData: { email: 'me@work.com', displayName: 'Me' } },
  },
  app: { hideMainMenu: true, minimizeToTray: true, promptDownload: true },
  onboarding: { done: true },
};

beforeAll(() => umzug.up());

describe('applying a settings import to the database', () => {
  let snapshot: SettingsSnapshot;

  beforeAll(async () => {
    // computer B: has its own app, a token for the shared identity, and machine-specific settings
    const backend: any = getBackend();
    await backend.userIdentities.actualSet(Immutable.fromJS({
      'id-work': { identityId: 'id-work', provider: 'google', userId: 'u1', accessToken: 'LOCAL-TOKEN', refreshToken: 'LOCAL-REFRESH', profileData: { email: 'me@work.com' } },
    }));
    await backend.applications.actualSet(Immutable.fromJS({
      old: { applicationId: 'old', manifestURL: 'station-manifest://99', activeTab: 'old-home' },
    }));
    await backend.tabs.actualSet(Immutable.fromJS({
      'old-home': { tabId: 'old-home', applicationId: 'old', isApplicationHome: true, url: 'https://old/' },
    }));
    await backend.dock.actualSet(Immutable.List(['old']));
    await backend.app.actualSet(Immutable.Map({ version: '9.9.9', autoLaunchEnabled: true, downloadFolder: '/b/Downloads', hideMainMenu: false }));
    await backend.nav.actualSet(Immutable.Map({ tabApplicationId: 'old', previousTabApplicationId: 'old' }));

    snapshot = createSnapshot(sourceState as any, { exportedFrom: 'computer-a', appVersion: '1' });
    pending = snapshot;
    await applyPendingImport(getBackend());
  });

  it('archives the pending import and records the synced hash', () => {
    expect(archived).toEqual(['applied']);
    expect(configWrites[0].lastHash).toBe(snapshot.hash);
  });

  it('writes the imported configuration', async () => {
    const db = await readAll();
    expect(Object.keys(db.applications).sort()).toEqual(['gmail1', 'slack']);
    expect(db.dock).toEqual(['gmail1', divider, 'slack']);
    expect(db.favorites.favorites.f1.url).toBe('https://app.slack.com/general');
    expect(db.orderedFavorites.slack.order).toEqual(['f1']);
    expect(db.applicationSettings['station-manifest://14'].alwaysLoaded).toBe(true);
    expect(db.applications.slack.installContext).toEqual({ origin: 'appstore' });
    expect(db.tabs['gmail1-home'].favicons).toEqual(['https://x/fav.ico']);
    expect(db.onboarding.done).toBe(true);
  });

  it('removes what the other computer removed and fixes references', async () => {
    const db = await readAll();
    expect(db.applications.old).toBeUndefined();
    expect(db.tabs['old-home']).toBeUndefined();
    expect(db.nav.tabApplicationId).toBe('gmail1');
  });

  it('keeps local tokens and machine-specific settings', async () => {
    const db = await readAll();
    expect(db.userIdentities['id-work'].accessToken).toBe('LOCAL-TOKEN');
    expect(db.userIdentities['id-work'].refreshToken).toBe('LOCAL-REFRESH');
    expect(db.userIdentities['id-work'].profileData.email).toBe('me@work.com');
    expect(db.app.version).toBe('9.9.9');
    expect(db.app.autoLaunchEnabled).toBe(true);
    expect(db.app.downloadFolder).toBe('/b/Downloads');
    expect(db.app.hideMainMenu).toBe(true);
  });

  it('reads back with the same hash, so the next sync does not see a change (no ping-pong)', async () => {
    const db = await readAll();
    expect(hashSnapshotData(buildSnapshotData(db))).toBe(snapshot.hash);
  });

  it('is a no-op when nothing is pending', async () => {
    archived.length = 0;
    await applyPendingImport(getBackend());
    expect(archived).toEqual([]);
  });
});
