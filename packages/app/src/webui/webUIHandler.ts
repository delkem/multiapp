import { protocol, session } from 'electron';
import { BX_PROTOCOL } from './const';
import { handleOnSession } from './protocolHandler';

export { handleOnSession };

protocol.registerSchemesAsPrivileged([
  {
    scheme: BX_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
    }
  },
]);

export function start() {
  handleOnSession(session.defaultSession);
}
