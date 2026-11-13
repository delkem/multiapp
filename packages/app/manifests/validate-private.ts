import { PrivateApplicationRequest } from '../src/plugins/bxapi';

const isURLWithProtocol = (value: unknown, protocols: string[]) => {
  if (typeof value !== 'string') return false;
  try {
    return protocols.includes(new URL(value).protocol);
  } catch (e) {
    return false;
  }
};

/**
 * A custom app is a website: it must start on a web page and use a web or
 * inline image as icon. Anything else (`file:`, `station:`, `javascript:`...)
 * is refused.
 */
export function validatePrivateApplicationRequest(payload: PrivateApplicationRequest) {
  if (!isURLWithProtocol(payload.startURL, ['http:', 'https:'])) {
    throw new TypeError('The start URL of a custom app must be an http or https URL');
  }
  if (!isURLWithProtocol(payload.bxIconURL, ['http:', 'https:'])
    && !(typeof payload.bxIconURL === 'string' && payload.bxIconURL.startsWith('data:image/'))) {
    throw new TypeError('The icon of a custom app must be an http, https or data:image URL');
  }
}
