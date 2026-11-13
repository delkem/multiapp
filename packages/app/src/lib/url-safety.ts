import log from 'electron-log';

/**
 * URL schemes Station hands to the operating system. Anything else is refused:
 * `file:`, `smb:` or a UNC path would run or open local / network files, and
 * Windows registers many handlers (`ms-msdt:`, `search-ms:`, `ms-officecmd:`...)
 * that have been used to run code from a single link.
 *
 * Besides web, mail and phone links, it keeps the meeting and chat apps that
 * links in web apps commonly open ("Join meeting", "Open in Slack"...).
 */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'callto:',
  'sip:',
  'sips:',
  'zoommtg:',
  'zoomus:',
  'msteams:',
  'slack:',
  'skype:',
  'tg:',
  'whatsapp:',
  'webex:',
  'wbx:',
  'facetime:',
  'facetime-audio:',
]);

/** An http(s) URL: navigating a tab to it cannot run script in the current page */
export const isWebURL = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch (e) {
    return false;
  }
};

export const isSafeExternalURL = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch (e) {
    return false;
  }
};

/**
 * `shell.openExternal`, but only for {@link isSafeExternalURL} URLs.
 * `open` is `shell.openExternal` or `remote.shell.openExternal`.
 */
export const openExternalSafely = (
  url: unknown,
  open: (url: string) => Promise<void>
): Promise<void> => {
  if (!isSafeExternalURL(url)) {
    log.warn(`[shell] refused to open external URL ${String(url).slice(0, 200)}`);
    return Promise.resolve();
  }
  return open(url);
};
