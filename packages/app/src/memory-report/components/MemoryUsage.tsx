import { Tooltip } from '@getstation/theme';
import * as React from 'react';
// @ts-ignore: no declaration file
import injectSheet from 'react-jss';
import { connect } from 'react-redux';

import { MemorySnapshot } from '../../services/services/extendedAppMetrics/interface';
import { getTabWebcontents } from '../../tab-webcontents/selectors';
import { getTabs } from '../../tabs/selectors';
import { getApplications } from '../../applications/selectors';
import { StationState } from '../../types';
import { useMemorySnapshot } from '../memorySnapshotPoller';
import { computeMemoryUsage, formatMemory, getWebContentsApplicationId, MemoryUsage } from '../usage';

/**
 * `connect` re-runs mapState on every store change; only recompute when the
 * snapshot or the state the attribution reads has changed.
 */
let cache: { snapshot?: MemorySnapshot, deps: any[], usage?: MemoryUsage } = { deps: [] };
const memoizedUsage = (state: StationState, snapshot?: MemorySnapshot): MemoryUsage | undefined => {
  if (!snapshot) return undefined;
  const deps = [getTabWebcontents(state), getTabs(state), getApplications(state)];
  if (cache.snapshot !== snapshot || deps.some((d, i) => d !== cache.deps[i])) {
    cache = { snapshot, deps, usage: computeMemoryUsage(snapshot, wc => getWebContentsApplicationId(state, wc)) };
  }
  return cache.usage;
};

function withMemorySnapshot<P>(Inner: React.ComponentType<P & { snapshot?: MemorySnapshot }>) {
  return (props: P) => {
    const snapshot = useMemorySnapshot();
    return <Inner {...props} snapshot={snapshot} />;
  };
}

// ---------------------------------------------------------------------------
// Total, at the bottom of the dock

interface TotalClasses {
  container: string,
  value: string,
  unit: string,
}

interface TotalProps {
  classes?: TotalClasses,
  totalKB?: number,
  onClick?: () => any,
}

const totalStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    margin: [4, 0, 2],
    color: '#fff',
    opacity: 0.75,
    fontSize: 10,
    lineHeight: '11px',
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': { opacity: 1 },
  },
  value: {
    fontWeight: 'bold',
  },
  unit: {
  },
};

const DockTotalView = injectSheet(totalStyles)(({ classes, totalKB, onClick }: TotalProps) => {
  if (typeof totalKB !== 'number') return null;
  const [value, unit] = formatMemory(totalKB).split(' ');
  return (
    <Tooltip placement="right" tooltip={`Station is using ${formatMemory(totalKB)} of memory. Click to open the Process Manager.`}>
      <div className={classes!.container} onClick={onClick}>
        <span className={classes!.value}>{value}</span>
        <span className={classes!.unit}>{unit}</span>
      </div>
    </Tooltip>
  );
});

export const DockMemoryUsage = withMemorySnapshot<{ onClick?: () => any }>(
  connect((state: StationState, { snapshot }: { snapshot?: MemorySnapshot }) => {
    const usage = memoizedUsage(state, snapshot);
    return { totalKB: usage && usage.totalKB };
  })(DockTotalView) as any,
);

// ---------------------------------------------------------------------------
// One app, in the app popup (subdock) header

interface AppProps {
  applicationId: string,
  appKB?: number,
  loaded?: boolean,
}

const ApplicationMemoryView = ({ appKB, loaded }: AppProps) => {
  if (!loaded) return null;
  return (
    <small title="Memory used by this app's open tabs">
      Memory: {appKB ? formatMemory(appKB) : 'not running'}
    </small>
  );
};

export const ApplicationMemoryUsage = withMemorySnapshot<{ applicationId: string }>(
  connect((state: StationState, { snapshot, applicationId }: { snapshot?: MemorySnapshot, applicationId: string }) => {
    const usage = memoizedUsage(state, snapshot);
    return { loaded: Boolean(usage), appKB: usage && usage.byApplicationId[applicationId] };
  })(ApplicationMemoryView) as any,
);
