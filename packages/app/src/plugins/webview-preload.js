  const { contextBridge, ipcRenderer } = require('electron');
  const { Observable } = require('rxjs');
  const { sendToWebContentsWithSender } = require('../lib/ipc-send-to');

  const sendPerformToProxy = (channel, payload) => {
    const p = new Promise(resolve => {
      ipcRenderer.once(`bx-api-perform-response-${channel}`, (_, result) => {
        resolve(result);
      });
    });
    setTimeout(() => {
      ipcRenderer.invoke('get-worker-contents-id')
          .then(workerWebContentsId =>
            sendToWebContentsWithSender(workerWebContentsId, 'bx-api-perform', channel, payload));
    }, 1);
    return p;
  };

  /**
   * Never hand the IPC event to the page: through the context bridge its
   * `sender` would give the page the whole `ipcRenderer`. Listeners get an
   * empty object in its place, so their `(_event, ...args)` signature is kept.
   */
  const wrappedListeners = new Map();
  const onIpc = (channel, listener) => {
    const wrapped = (_event, ...args) => listener({}, ...args);
    if (!wrappedListeners.has(listener)) wrappedListeners.set(listener, new Map());
    wrappedListeners.get(listener).set(channel, wrapped);
    ipcRenderer.on(channel, wrapped);
  };
  const offIpc = (channel, listener) => {
    const byChannel = wrappedListeners.get(listener);
    const wrapped = byChannel && byChannel.get(channel);
    if (!wrapped) return;
    ipcRenderer.off(channel, wrapped);
    byChannel.delete(channel);
    if (byChannel.size === 0) wrappedListeners.delete(listener);
  };

  const addListenerToChannel = (channel, listener) => {
    onIpc(`bx-api-subscribe-response-${channel}`, listener);
    setTimeout(() => {
      ipcRenderer.invoke('get-worker-contents-id')
          .then(workerWebContentsId =>
            sendToWebContentsWithSender(workerWebContentsId, 'bx-api-subscribe', channel));
    }, 1);
  };

  const removeListenerToChannel = (channel, listener) => {
    offIpc(`bx-api-subscribe-response-${channel}`, listener);
  }

  class BxAPI {
    static async perform(channel, payload, requiredParams) {
      if (requiredParams) {
        for (const requiredParam of requiredParams) {
          if (!payload[requiredParam]) {
            throw new TypeError(`${requiredParam} value is missing`);
          }
        }
      }

      await BxAPI.appIsReady();
      return sendPerformToProxy(channel, payload);
    }

    static async appIsReady() {
      return new Promise(resolve => {
        if (document.readyState !== 'loading') {
          return resolve();
        }
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
  }

  const bxApi = {
    notificationCenter: {
        addSnoozeDurationInMsChangeListener: (listener) => addListenerToChannel('GetSnoozeDuration', listener),

        sendNotification: (id, notification) => ipcRenderer.send('new-notification', id, notification),
        closeNotification: (id) => ipcRenderer.send('notification-close', id),

        addNotificationClickListener: (listener) => onIpc('trigger-notification-click', listener),
        removeNotificationClickListener: (listener) => offIpc('trigger-notification-click', listener),
    },
  };

  // Station's own pages (app store, multi-instance configurator) are served on
  // the `station:` protocol. Only they get the privileged APIs: installing or
  // removing apps, signing in, reading identities. Any other website only gets
  // the notifications API. The main process enforces the same rule, see
  // `lib/ipc-send-to.ts`.
  const isStationPage = window.location.protocol === 'station:';

  const privilegedBxApi = {
    applications: {
      install: (payload) => BxAPI.perform(
        'InstallApplication',
        payload,
        ['manifestURL', 'context']
      ),
      uninstall: (applicationId) => BxAPI.perform(
        'UninstallApplication',
        { applicationId },
        ['applicationId']
      ),
      uninstallByManifest: (manifestURL) => BxAPI.perform(
        'UninstallApplications',
        { manifestURL },
        ['manifestURL']
      ),
      setConfigData: (applicationId, configData) => BxAPI.perform(
        'SetApplicationConfigData',
        { applicationId, configData },
        ['applicationId', 'configData']
      ),
      search: (query) => BxAPI.perform(
        'SearchApplication',
        { query },
        ['query']
      ),
      getMostPopularApps: () => BxAPI.perform('GetMostPopularApplication', {}, []),
      getAllCategories: () => BxAPI.perform('GetAllCategories', {}, []),
      getApplicationsByCategory: () => BxAPI.perform('GetApplicationsByCategory', {}, []),
      requestPrivate: (payload) => BxAPI.perform(
        'RequestPrivateApplication',
        payload,
        ['name', 'themeColor', 'bxIconURL', 'startURL', 'scope']
      ),
      getPrivateApps: () => BxAPI.perform(
        'GetPrivateApplications',
        {},
        []
      )
    },
    theme: {
      addThemeColorsChangeListener: (listener) => addListenerToChannel('GetThemeColors', listener),
    },
    identities: {
      addIdentitiesChangeListener: (listener) => addListenerToChannel('GetAllIdentities', listener),
      removeIdentitiesChangeListener: (listener) => removeListenerToChannel('GetAllIdentities', listener),

      requestLogin: (provider) => BxAPI.perform(
        'RequestLogin',
        { provider },
        ['provider']
      ),
    },
     manifest: {
      getManifest: (manifestURL) => BxAPI.perform(
        'GetManifestByURL', 
        { manifestURL }, 
        ['manifestURL']
      ),
     }
    };

    contextBridge.exposeInMainWorld('bxApi', isStationPage ? { ...bxApi, ...privilegedBxApi } : bxApi);

    console.log('>>>> contextBridge done')
