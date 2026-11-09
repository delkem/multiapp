/**
 * Dock dividers.
 *
 * Dividers live in the same ordered `dock` list as application ids, so they
 * persist and reorder exactly like apps without any schema change.
 * A divider entry is encoded as: `station-divider:<dividerId>:<encodedLabel>`
 *   - `dividerId` is stable (survives renames) and never contains ':'
 *   - `encodedLabel` is `encodeURIComponent(label)`, empty for a plain line
 */
export const DIVIDER_PREFIX = 'station-divider:';
export const MAX_DIVIDER_LABEL_LENGTH = 40;

export type DockDivider = {
  dividerId: string,
  label: string,
};

export const isDividerItem = (item: unknown): item is string =>
  typeof item === 'string' && item.startsWith(DIVIDER_PREFIX);

export const sanitizeDividerLabel = (label: string = '') =>
  label.replace(/\s+/g, ' ').trim().slice(0, MAX_DIVIDER_LABEL_LENGTH);

export const createDividerItem = (dividerId: string, label: string = '') => {
  if (!dividerId || dividerId.includes(':')) {
    throw new Error(`Invalid divider id: ${dividerId}`);
  }
  return `${DIVIDER_PREFIX}${dividerId}:${encodeURIComponent(sanitizeDividerLabel(label))}`;
};

export const parseDividerItem = (item: string): DockDivider => {
  const rest = item.slice(DIVIDER_PREFIX.length);
  const separatorIndex = rest.indexOf(':');
  if (separatorIndex === -1) return { dividerId: rest, label: '' };

  const rawLabel = rest.slice(separatorIndex + 1);
  let label = '';
  try {
    label = decodeURIComponent(rawLabel);
  } catch (e) {
    label = rawLabel;
  }
  return { dividerId: rest.slice(0, separatorIndex), label };
};

export const getDividerId = (item: string) => parseDividerItem(item).dividerId;
