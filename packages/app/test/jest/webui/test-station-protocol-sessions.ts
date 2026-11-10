import { app, session } from 'electron';
import { BX_PROTOCOL } from '../../../src/webui/const';

// the station:// page handlers build their file paths from webpack's public path,
// which only exists in a webpack build
(global as any).__webpack_public_path__ = '/';
const { handleOnSession } = require('../../../src/webui/protocolHandler');

// Apps that don't use the default session (e.g. every Google app) load
// `station://multi-instance-configurator` in their own `persist:<applicationId>`
// partition. If that session can't serve `station://`, Chromium hands the link
// to the OS and Windows shows "Get an app to open this 'station' link".
describe('station:// protocol', () => {
  beforeAll(() => app.whenReady());

  it('is not served by a new app partition on its own', () => {
    const sess = session.fromPartition(`persist:station-protocol-test-${Date.now()}-a`);
    expect(sess.protocol.isProtocolHandled(BX_PROTOCOL)).toBe(false);
  });

  it('is served by an app partition once handled', () => {
    const sess = session.fromPartition(`persist:station-protocol-test-${Date.now()}-b`);
    handleOnSession(sess);
    expect(sess.protocol.isProtocolHandled(BX_PROTOCOL)).toBe(true);
  });

  it('can be handled twice on the same session without throwing', () => {
    const sess = session.fromPartition(`persist:station-protocol-test-${Date.now()}-c`);
    handleOnSession(sess);
    expect(() => handleOnSession(sess)).not.toThrow();
    expect(sess.protocol.isProtocolHandled(BX_PROTOCOL)).toBe(true);
  });
});
