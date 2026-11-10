import { app, net, Session } from 'electron';
import { dirname } from 'path';
import { pathToFileURL } from 'url';
import { BX_PROTOCOL } from './const';
import handlers from './handlers';

const handleRequest = (req: GlobalRequest) => {
  const parsedUrl = new URL(req.url);
  const handler = handlers.find(h => h.hostname === parsedUrl.hostname);

  if (!handler) {
    return new Response(new Blob([`Handler not found for ${req.url}`]), { status: 404 });
  }
  if (!parsedUrl.pathname) {
    return new Response(new Blob([`Empty path in ${req.url}`]), { status: 404 });
  }

  if (parsedUrl.pathname !== '/') {
    const fileUrl = `${dirname(handler.filePath)}/${parsedUrl.pathname.substring(1)}`;
    return net.fetch(pathToFileURL(fileUrl).toString());
  }

  return net.fetch(pathToFileURL(handler.filePath).toString());
};

/**
 * Serve `station://` pages in the given session.
 *
 * Protocol handlers are per session. Apps that don't use the default session
 * (`persist:<applicationId>` partitions, e.g. every Google app) load
 * `station://multi-instance-configurator` in their own session, so each session
 * needs the handler. Without it, Chromium hands the link to the OS, which on
 * Windows shows "Get an app to open this 'station' link".
 */
export function handleOnSession(sess: Session) {
  // the protocol API is only usable once the app is ready
  if (!app.isReady()) {
    app.whenReady().then(() => handleOnSession(sess));
    return;
  }
  if (sess.protocol.isProtocolHandled(BX_PROTOCOL)) return;
  sess.protocol.handle(BX_PROTOCOL, handleRequest);
}
