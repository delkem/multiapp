import { ipcMain, ipcRenderer, webContents } from 'electron';
import log from 'electron-log';

/** renderer -> main: forward a message to another webContents */
const RELAY = 'bx.relay-to-webcontents';
/** renderer -> main: same, but the target also gets the sender webContents id */
const RELAY_WITH_SENDER = 'bx.relay-to-webcontents-with-sender';

/**
 * Renderer to renderer messaging.
 *
 * `ipcRenderer.sendTo` and `IpcRendererEvent.senderId` have been removed in Electron 28,
 * so the main process now relays those messages.
 * @see https://www.electronjs.org/docs/latest/breaking-changes#removed-ipcrenderersendto
 */

/** Channels of the bxApi exposed to web pages, see `plugins/webview-preload.js` */
const BX_API_PERFORM = 'bx-api-perform';
const BX_API_SUBSCRIBE = 'bx-api-subscribe';
/** The only bxApi channels any website may use: they back web notifications */
const PUBLIC_BX_API_SUBSCRIPTIONS = ['GetSnoozeDuration'];

const isStationPageURL = (url: string | undefined) => {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'station:';
  } catch (e) {
    return false;
  }
};

/**
 * Whether a renderer may relay this message. Web pages reach the relay through
 * the bxApi exposed by the webview preload: only Station's own `station:` pages
 * (app store, multi-instance configurator) may install or remove apps, sign in
 * or read identities. Other websites only get what notifications need.
 */
export const isRelayAllowed = (
  channel: string,
  args: any[],
  senderURL: string | undefined,
  withSender: boolean
): boolean => {
  if (channel !== BX_API_PERFORM && channel !== BX_API_SUBSCRIBE) return true;
  // The receiver trusts the sender id the relay adds: it must not be forgeable
  if (!withSender) return false;
  if (isStationPageURL(senderURL)) return true;
  return channel === BX_API_SUBSCRIBE && Array.isArray(args) && PUBLIC_BX_API_SUBSCRIPTIONS.includes(args[0]);
};

const getSenderURL = (event: Electron.IpcMainEvent): string | undefined => {
  try {
    if (event.senderFrame) return event.senderFrame.url;
    return event.sender.getURL();
  } catch (e) {
    return undefined;
  }
};

/**
 * Starts the relay. Must be called once from the main process, before any renderer
 * uses `sendToWebContents` / `sendToWebContentsWithSender`.
 */
export const startIpcSendToRelay = () => {
  const forward = (targetWebContentsId: number, channel: string, args: any[]) => {
    const target = webContents.fromId(targetWebContentsId);
    if (!target || target.isDestroyed() || target.isCrashed()) return;
    target.send(channel, ...args);
  };

  ipcMain.on(RELAY, (event: Electron.IpcMainEvent, targetWebContentsId: number, channel: string, args: any[]) => {
    if (!isRelayAllowed(channel, args, getSenderURL(event), false)) return;
    forward(targetWebContentsId, channel, args);
  });

  ipcMain.on(
    RELAY_WITH_SENDER,
    (event: Electron.IpcMainEvent, targetWebContentsId: number, channel: string, args: any[]) => {
      if (!isRelayAllowed(channel, args, getSenderURL(event), true)) {
        log.warn(`[ipc] blocked ${channel} ${args && args[0]} from ${getSenderURL(event)}`);
        return;
      }
      forward(targetWebContentsId, channel, [event.sender.id, ...(args || [])]);
    }
  );
};

/**
 * From a renderer process, send a message to another webContents.
 * Drop-in replacement for `ipcRenderer.sendTo`: the receiver signature is unchanged.
 */
export const sendToWebContents = (targetWebContentsId: number, channel: string, ...args: any[]) => {
  ipcRenderer.send(RELAY, targetWebContentsId, channel, args);
};

/**
 * Same as {@link sendToWebContents}, but the receiver also gets the sender webContents id
 * as first argument, which used to be read from `event.senderId`.
 * The receiver must use {@link onFromWebContents}.
 */
export const sendToWebContentsWithSender = (targetWebContentsId: number, channel: string, ...args: any[]) => {
  ipcRenderer.send(RELAY_WITH_SENDER, targetWebContentsId, channel, args);
};

/**
 * Receiving counterpart of {@link sendToWebContentsWithSender}.
 * Returns a function removing the listener.
 */
export const onFromWebContents = (
  channel: string,
  listener: (senderWebContentsId: number, ...args: any[]) => void
) => {
  const handler = (_event: Electron.IpcRendererEvent, senderWebContentsId: number, ...args: any[]) => {
    listener(senderWebContentsId, ...args);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};
