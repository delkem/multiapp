import * as Immutable from 'immutable';
import createCachedSelector from 're-reselect';
import { createSelector } from 'reselect';
import { getApplicationId } from '../applications/get';
import { getApplications, getBadgeForApplication } from '../applications/selectors';
import { ApplicationImmutable, StationApplication } from '../applications/types';
import { getOrderedFavoritesForApplicationId } from '../ordered-favorites/selectors';
import { getOrderedTabsForApplicationId } from '../ordered-tabs/selectors';
import { getTabsForApplication } from '../tabs/selectors';
import { StationState } from '../types';
import { getLastActivityAt, getTabIsApplicationHome, getTabFavoriteId } from '../tabs/get';
import { isDividerItem, parseDividerItem } from './dividers';

export const getDock = (state: StationState) => state.get('dock');

export const getTabsAndFavoritesForApplication = createCachedSelector(
  [getOrderedTabsForApplicationId, getOrderedFavoritesForApplicationId, getTabsForApplication],
  (orderedTabs, orderedFavorites, tabs) => {
    const homeTab = tabs.find(tab => tab.get('isApplicationHome'));

    return Immutable.List([homeTab])
      .concat(orderedFavorites)
      .concat(orderedTabs)
      .filter(Boolean);
  }
)(
  /*
   * Re-reselect resolver function.
   * Cache/call a new selector for each different "applicationId"
   */
  (_state, applicationId) => applicationId
);

export const getRecentTabsAndFavoritesForApplication = createCachedSelector(
  getTabsAndFavoritesForApplication,
  (_state: StationState, _applicationId: StationApplication['applicationId'], activityBefore: number) => activityBefore,
  (tabsAndFavorites, activityBefore) => {
    return tabsAndFavorites.filter(
      t => getTabIsApplicationHome(t) || Boolean(getTabFavoriteId(t)) || (getLastActivityAt(t)! > activityBefore)
    );
  }
)(
  (_state, applicationId, activityBefore) =>
    `${applicationId}-${activityBefore}`
);

export const getFirstApplicationIdInDock = (state: StationState) =>
  state.get('dock').find((item: string) => !isDividerItem(item));

const withBadge = (application: ApplicationImmutable, badgeForApplication: (applicationId: string) => any) =>
  application.merge(Immutable.Map({ badge: badgeForApplication(getApplicationId(application)) })) as ApplicationImmutable;

/**
 * Applications only (dividers excluded), in dock order.
 * Used for keyboard shortcuts (Ctrl+<n>, Ctrl+Alt+arrows) so dividers are skipped.
 */
export const getApplicationsForDock = createSelector([getDock, getApplications, getBadgeForApplication],
  (dock, applications, badgeForApplication) => dock
    .filter((item: string) => !isDividerItem(item))
    .toOrderedSet()
    .map((appId: string) => applications.get(appId))
    .filter(application => Boolean(application))
    .map((application: ApplicationImmutable) => withBadge(application, badgeForApplication))
    .toList()
);

export type DockEntry =
  | { type: 'application', key: string, index: number, application: ApplicationImmutable }
  | { type: 'divider', key: string, index: number, item: string, dividerId: string, label: string };

/**
 * Everything rendered in the dock, in order. `index` is the position in the raw
 * `dock` list, which is what `changeAppItemPosition` expects.
 */
export const getDockEntries = createSelector([getDock, getApplications, getBadgeForApplication],
  (dock, applications, badgeForApplication): DockEntry[] => {
    const entries: DockEntry[] = [];
    const seen = new Set<string>();
    dock.forEach((item: string, index: number) => {
      if (seen.has(item)) return;
      seen.add(item);
      if (isDividerItem(item)) {
        const { dividerId, label } = parseDividerItem(item);
        entries.push({ type: 'divider', key: `divider-${dividerId}`, index, item, dividerId, label });
        return;
      }
      const application = applications.get(item);
      if (!application) return;
      entries.push({ type: 'application', key: item, index, application: withBadge(application, badgeForApplication) });
    });
    return entries;
  }
);
