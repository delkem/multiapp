import log from 'electron-log';
import { getManifestOrTimeout } from '../applications/api';
import { IManifestProvider } from '../applications/manifest-provider/types';
import { getApplicationDescription, getApplications } from '../applications/selectors';
import { getApplicationId, getApplicationManifestURL } from '../applications/get';
import services from '../services/servicesManager';
import { getTabWebcontentsByWebContentsId, getWebcontentsTabId } from '../tab-webcontents/selectors';
import { getApplicationByTabId } from '../tabs/selectors';
import { StationState } from '../types';
import { buildMemoryReport, Owner } from './report';

const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/** Writes the memory used by each app (and by Station itself) to the log file. */
export async function logMemoryUsage(getState: () => StationState, manifestProvider: IManifestProvider) {
  const snapshot = await services.extendedAppMetrics.getMemorySnapshot();
  const state = getState();

  // app names come from manifests; fetch each once
  const names = new Map<string, string>();
  await Promise.all(getApplications(state).valueSeq().toArray().map(async (application: any) => {
    const manifestURL = getApplicationManifestURL(application);
    if (!manifestURL) return;
    try {
      const manifest = await getManifestOrTimeout(manifestProvider, manifestURL);
      if (manifest.name) names.set(getApplicationId(application), manifest.name);
    } catch {
      // the report falls back to the application id
    }
  }));

  const report = buildMemoryReport(snapshot, (wc): Owner => {
    const twc = getTabWebcontentsByWebContentsId(state, wc.webContentsId);
    const tabId = twc && getWebcontentsTabId(twc);
    const application = tabId ? getApplicationByTabId(state, tabId) : null;
    if (application) {
      const applicationId = getApplicationId(application);
      const name = names.get(applicationId) || `App ${applicationId}`;
      const description = getApplicationDescription(state, application);
      return { key: `app:${applicationId}`, label: description ? `${name} (${description})` : name };
    }
    if (wc.type === 'webview') {
      const label = `Other page: ${hostOf(wc.url)}`;
      return { key: label, label };
    }
    return { key: 'station-ui', label: 'Station windows' };
  });

  log.info(`\n${report.text}`);
  return report;
}
