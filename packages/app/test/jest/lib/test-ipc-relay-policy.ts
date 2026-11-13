import { isRelayAllowed } from '../../../src/lib/ipc-send-to';

const APPSTORE = 'station://appstore/index.html';
const WEBSITE = 'https://evil.example/';

describe('isRelayAllowed', () => {
  it('lets other channels through', () => {
    expect(isRelayAllowed('some-other-channel', [1, 2], WEBSITE, false)).toBe(true);
    expect(isRelayAllowed('some-other-channel', [1, 2], WEBSITE, true)).toBe(true);
  });

  it('lets Station pages use the privileged bxApi', () => {
    expect(isRelayAllowed('bx-api-perform', ['InstallApplication', {}], APPSTORE, true)).toBe(true);
    expect(isRelayAllowed('bx-api-perform', ['RequestPrivateApplication', {}], APPSTORE, true)).toBe(true);
    expect(isRelayAllowed('bx-api-subscribe', ['GetAllIdentities'], 'station://multi-instance-configurator/', true))
      .toBe(true);
  });

  it('refuses privileged bxApi calls from websites', () => {
    expect(isRelayAllowed('bx-api-perform', ['InstallApplication', {}], WEBSITE, true)).toBe(false);
    expect(isRelayAllowed('bx-api-perform', ['RequestPrivateApplication', {}], WEBSITE, true)).toBe(false);
    expect(isRelayAllowed('bx-api-perform', ['UninstallApplication', {}], WEBSITE, true)).toBe(false);
    expect(isRelayAllowed('bx-api-subscribe', ['GetAllIdentities'], WEBSITE, true)).toBe(false);
    expect(isRelayAllowed('bx-api-subscribe', ['GetThemeColors'], WEBSITE, true)).toBe(false);
  });

  it('lets websites subscribe to the snooze duration used by notifications', () => {
    expect(isRelayAllowed('bx-api-subscribe', ['GetSnoozeDuration'], WEBSITE, true)).toBe(true);
    expect(isRelayAllowed('bx-api-perform', ['GetSnoozeDuration'], WEBSITE, true)).toBe(false);
  });

  it('refuses bxApi messages without a relay-provided sender, even from Station pages', () => {
    expect(isRelayAllowed('bx-api-perform', ['InstallApplication', {}], APPSTORE, false)).toBe(false);
    expect(isRelayAllowed('bx-api-subscribe', ['GetSnoozeDuration'], WEBSITE, false)).toBe(false);
  });

  it('refuses unknown or malformed senders', () => {
    expect(isRelayAllowed('bx-api-perform', ['InstallApplication', {}], undefined, true)).toBe(false);
    expect(isRelayAllowed('bx-api-perform', ['InstallApplication', {}], 'not a url', true)).toBe(false);
    expect(isRelayAllowed('bx-api-perform', ['InstallApplication', {}], 'https://station.example/', true)).toBe(false);
  });
});
