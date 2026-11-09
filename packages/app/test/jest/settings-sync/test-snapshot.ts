import { createDividerItem } from '../../../src/dock/dividers';
import {
  buildSnapshotData,
  createSnapshot,
  hashSnapshotData,
  LocalState,
  mergeSnapshotIntoLocal,
  parseSnapshot,
  SNAPSHOT_FORMAT,
} from '../../../src/settings-sync/snapshot';

const divider = createDividerItem('d1', 'Work');

const machineA = (): LocalState => ({
  applications: {
    gmail1: { applicationId: 'gmail1', manifestURL: 'station-manifest://14', identityId: 'id-work', activeTab: 'gmail1-t2', notificationsEnabled: true, runtimeOnly: 'x' },
    gmail2: { applicationId: 'gmail2', manifestURL: 'station-manifest://14', identityId: 'id-home', activeTab: 'gmail2-home' },
    slack: { applicationId: 'slack', manifestURL: 'station-manifest://21', activeTab: 'slack-home' },
  },
  tabs: {
    'gmail1-home': { tabId: 'gmail1-home', applicationId: 'gmail1', isApplicationHome: true, url: 'https://mail.google.com/a', title: 'Inbox', lastActivityAt: 1 },
    'gmail1-t2': { tabId: 'gmail1-t2', applicationId: 'gmail1', isApplicationHome: false, url: 'https://mail.google.com/b' },
    'gmail2-home': { tabId: 'gmail2-home', applicationId: 'gmail2', isApplicationHome: true, url: 'https://mail.google.com/c' },
    'slack-home': { tabId: 'slack-home', applicationId: 'slack', isApplicationHome: true, url: 'https://app.slack.com' },
  },
  dock: ['gmail1', divider, 'gmail2', 'slack', 'ghost-app'],
  favorites: { favorites: { f1: { favoriteId: 'f1', applicationId: 'slack', title: 'General', url: 'https://app.slack.com/general', favicons: ['x'] } } },
  orderedFavorites: { slack: { applicationId: 'slack', order: ['f1'] }, removed: { applicationId: 'removed', order: [] } },
  applicationSettings: { 'station-manifest://14': { manifestURL: 'station-manifest://14', alwaysLoaded: true } },
  userIdentities: {
    'id-work': { identityId: 'id-work', provider: 'google', userId: 'u1', accessToken: 'SECRET-A', refreshToken: 'SECRET-R', profileData: { email: 'me@work.com', displayName: 'Me', imageURL: 'pic' } },
    'id-home': { identityId: 'id-home', provider: 'google', userId: 'u2', accessToken: 'SECRET-B', profileData: { email: 'me@home.com' } },
  },
  app: { version: '4.0', autoLaunchEnabled: true, downloadFolder: '/Users/a/Downloads', hideMainMenu: true, minimizeToTray: false, promptDownload: true },
  onboarding: { done: true },
});

describe('settings snapshot export', () => {
  const data = buildSnapshotData(machineA());

  it('never contains tokens', () => {
    expect(JSON.stringify(data)).not.toMatch(/SECRET/);
    expect(data.userIdentities['id-work']).toEqual({
      identityId: 'id-work', provider: 'google', userId: 'u1',
      profileData: { email: 'me@work.com', displayName: 'Me', imageURL: 'pic' },
    });
  });

  it('keeps only home tabs and known fields', () => {
    expect(Object.keys(data.homeTabs).sort()).toEqual(['gmail1-home', 'gmail2-home', 'slack-home']);
    expect(data.applications.gmail1.runtimeOnly).toBeUndefined();
  });

  it('keeps dividers, drops unknown apps from the dock', () => {
    expect(data.dock).toEqual(['gmail1', divider, 'gmail2', 'slack']);
  });

  it('leaves machine-specific app settings out', () => {
    expect(data.app).toEqual({ hideMainMenu: true, minimizeToTray: false, promptDownload: true });
  });

  it('drops favorites ordering of removed apps', () => {
    expect(Object.keys(data.orderedFavorites)).toEqual(['slack']);
  });

  it('omits profileData when an identity has none', () => {
    const d = buildSnapshotData({ userIdentities: { x: { identityId: 'x', provider: 'google', profileData: null } } });
    expect('profileData' in d.userIdentities.x).toBe(false);
  });
});

describe('settings snapshot hash', () => {
  const hashOf = (s: LocalState) => hashSnapshotData(buildSnapshotData(s));

  it('ignores browsing noise (active tab, home tab url/title, favicons, profile picture)', () => {
    const a = machineA();
    const b = machineA();
    b.applications!.gmail1.activeTab = 'gmail1-home';
    b.tabs!['gmail1-home'].url = 'https://mail.google.com/somewhere-else';
    b.tabs!['gmail1-home'].lastActivityAt = 999;
    b.favorites!.favorites!.f1.favicons = ['y'];
    b.userIdentities!['id-work'].profileData.imageURL = 'new-pic';
    expect(hashOf(b)).toBe(hashOf(a));
  });

  it('treats null and missing values the same (database round trip)', () => {
    const a = machineA();
    const b = machineA();
    b.applications!.slack.notificationsEnabled = null;
    b.applications!.slack.customURL = undefined;
    expect(hashOf(b)).toBe(hashOf(a));
  });

  it('changes on meaningful edits', () => {
    const a = machineA();
    const reordered = machineA();
    reordered.dock = ['gmail2', divider, 'gmail1', 'slack'];
    const renamedDivider = machineA();
    renamedDivider.dock = ['gmail1', createDividerItem('d1', 'Personal'), 'gmail2', 'slack'];
    const otherAccount = machineA();
    otherAccount.applications!.gmail1.identityId = 'id-home';
    const pref = machineA();
    pref.app!.hideMainMenu = false;

    for (const changed of [reordered, renamedDivider, otherAccount, pref]) {
      expect(hashOf(changed)).not.toBe(hashOf(a));
    }
  });

  it('does not depend on key order', () => {
    const a = machineA();
    const b = machineA();
    b.applications = { slack: b.applications!.slack, gmail2: b.applications!.gmail2, gmail1: b.applications!.gmail1 };
    expect(hashOf(b)).toBe(hashOf(a));
  });
});

describe('settings snapshot file', () => {
  it('round-trips and recomputes the hash', () => {
    const snapshot = createSnapshot(machineA(), { exportedFrom: 'laptop', appVersion: '4.0', now: new Date('2026-01-01T00:00:00Z') });
    const parsed = parseSnapshot(JSON.stringify({ ...snapshot, hash: 'tampered' }));
    expect(parsed.hash).toBe(snapshot.hash);
    expect(parsed.data).toEqual(snapshot.data);
    expect(parsed.exportedFrom).toBe('laptop');
  });

  it('rejects invalid files with readable errors', () => {
    expect(() => parseSnapshot('not json')).toThrow('not valid JSON');
    expect(() => parseSnapshot('{"foo":1}')).toThrow('not a settings file');
    expect(() => parseSnapshot(JSON.stringify({ format: SNAPSHOT_FORMAT + 1, data: {} }))).toThrow('Unsupported');
  });
});

describe('settings snapshot import (merge)', () => {
  const imported = buildSnapshotData(machineA());

  it('sets up a brand new computer completely', () => {
    const merged = mergeSnapshotIntoLocal({}, imported);
    expect(Object.keys(merged.applications).sort()).toEqual(['gmail1', 'gmail2', 'slack']);
    expect(merged.dock).toEqual(['gmail1', divider, 'gmail2', 'slack']);
    // every app gets its home tab, and its active tab points to an existing tab
    for (const app of Object.values(merged.applications) as any[]) {
      expect(merged.tabs[app.activeTab]).toBeDefined();
      expect(merged.tabs[app.activeTab].applicationId).toBe(app.applicationId);
    }
    // gmail1's active tab on machine A was a non-home tab that is not synced: falls back to home
    expect(merged.applications.gmail1.activeTab).toBe('gmail1-home');
    expect(merged.userIdentities['id-work'].accessToken).toBeUndefined();
    expect(merged.onboarding.done).toBe(true);
    expect(merged.nav.tabApplicationId).toBe('gmail1');
    expect(merged.favorites.favorites.f1.url).toBe('https://app.slack.com/general');
  });

  it('keeps local tabs, active tabs and tokens of apps that already exist here', () => {
    const local: LocalState = {
      applications: { slack: { applicationId: 'slack', manifestURL: 'station-manifest://21', activeTab: 'slack-local-2' } },
      tabs: {
        'slack-local-home': { tabId: 'slack-local-home', applicationId: 'slack', isApplicationHome: true, url: 'https://app.slack.com/local' },
        'slack-local-2': { tabId: 'slack-local-2', applicationId: 'slack', url: 'https://app.slack.com/thread' },
      },
      userIdentities: { 'id-work': { identityId: 'id-work', accessToken: 'LOCAL-TOKEN', refreshToken: 'LOCAL-REFRESH' } },
    };
    const merged = mergeSnapshotIntoLocal(local, imported);
    expect(merged.applications.slack.activeTab).toBe('slack-local-2');
    expect(merged.tabs['slack-local-2']).toBeDefined();
    // the imported home tab is not added on top of the local one
    expect(merged.tabs['slack-home']).toBeUndefined();
    expect(merged.userIdentities['id-work'].accessToken).toBe('LOCAL-TOKEN');
    expect(merged.userIdentities['id-work'].refreshToken).toBe('LOCAL-REFRESH');
  });

  it('removes apps (and their tabs, ordering, detached windows) that were removed elsewhere', () => {
    const local: LocalState = {
      applications: { old: { applicationId: 'old', activeTab: 'old-home' } },
      tabs: { 'old-home': { tabId: 'old-home', applicationId: 'old', isApplicationHome: true } },
      dock: ['old'],
      orderedTabs: { old: { applicationId: 'old', order: ['old-home'] } },
      subwindows: ['old-home'],
      nav: { tabApplicationId: 'old', previousTabApplicationId: 'old' },
    };
    const merged = mergeSnapshotIntoLocal(local, imported);
    expect(merged.applications.old).toBeUndefined();
    expect(merged.tabs['old-home']).toBeUndefined();
    expect(merged.orderedTabs.old).toBeUndefined();
    expect(merged.subwindows).toEqual([]);
    expect(merged.nav.tabApplicationId).toBe('gmail1');
    expect(merged.nav.previousTabApplicationId).toBeNull();
  });

  it('keeps machine-specific settings local', () => {
    const local: LocalState = { app: { version: '5.0', autoLaunchEnabled: false, downloadFolder: 'C:\\Downloads', hideMainMenu: false } };
    const merged = mergeSnapshotIntoLocal(local, imported);
    expect(merged.app).toEqual({
      version: '5.0', autoLaunchEnabled: false, downloadFolder: 'C:\\Downloads',
      hideMainMenu: true, minimizeToTray: false, promptDownload: true,
    });
  });

  it('round trip: a computer that imported a snapshot hashes to the same value (no sync ping-pong)', () => {
    const merged = mergeSnapshotIntoLocal({}, imported);
    const afterImport: LocalState = { ...merged, favorites: merged.favorites };
    expect(hashSnapshotData(buildSnapshotData(afterImport))).toBe(hashSnapshotData(imported));
  });
});
