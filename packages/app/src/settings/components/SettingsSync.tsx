import { Button, Size, ThemeTypes as Theme } from '@getstation/theme';
import * as React from 'react';
// @ts-ignore: no declaration file
import injectSheet from 'react-jss';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import {
  chooseSyncFolder, disableSync, exportSettingsFile, getSettingsSync, importSettingsFile, SettingsSyncStatus, syncNow,
} from '../../settings-sync/duck';
import { StationState } from '../../types';

interface Classes {
  container: string,
  settingName: string,
  description: string,
  row: string,
  value: string,
  actions: string,
  button: string,
  status: string,
  error: string,
}

interface DispatchProps {
  chooseSyncFolder: () => void,
  disableSync: () => void,
  syncNow: () => void,
  exportSettingsFile: () => void,
  importSettingsFile: () => void,
}

type Props = { classes?: Classes, sync: SettingsSyncStatus } & DispatchProps;

const styles = (_theme: Theme) => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '600px',
    paddingTop: '10px',
    paddingBottom: '10px',
  },
  settingName: {
    marginBottom: 8,
    textTransform: 'uppercase',
    fontSize: 14,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 10,
    lineHeight: '16px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 10,
  },
  value: {
    marginLeft: 10,
    fontSize: 12,
    opacity: 0.6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  actions: {
    marginLeft: 'auto',
    display: 'flex',
    flexShrink: 0,
  },
  button: {
    marginLeft: 6,
  },
  status: {
    fontSize: 12,
    opacity: 0.7,
  },
  error: {
    color: '#e74c3c',
    opacity: 1,
  },
});

@injectSheet(styles)
class SettingsSyncImpl extends React.PureComponent<Props> {
  render() {
    const { classes, sync } = this.props;
    const lastSynced = sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : 'not yet';

    return (
      <section className={classes!.container}>
        <p className={classes!.settingName}>sync settings between computers</p>
        <p className={classes!.description}>
          Keeps your apps, dock order, dividers, favorites and app settings the same on every computer,
          through a folder that syncs (for example your Google Drive folder).
          Sign-ins are not synced: you sign in to each app once per computer.
        </p>

        <div className={classes!.row}>
          <label>Folder:</label>
          <code className={classes!.value} title={sync.folder || ''}>{sync.folder || 'not set up'}</code>
          <aside className={classes!.actions}>
            {sync.folder && (
              <Button className={classes!.button} btnSize={Size.XXSMALL} onClick={this.props.syncNow}>Sync Now</Button>
            )}
            <Button className={classes!.button} btnSize={Size.XXSMALL} onClick={this.props.chooseSyncFolder}>
              {sync.folder ? 'Change' : 'Choose Folder…'}
            </Button>
            {sync.folder && (
              <Button className={classes!.button} btnSize={Size.XXSMALL} onClick={this.props.disableSync}>Turn Off</Button>
            )}
          </aside>
        </div>

        {sync.folder && (
          <div className={classes!.row}>
            <label>Last synced:</label>
            <span className={classes!.value}>{lastSynced}</span>
          </div>
        )}

        <div className={classes!.row}>
          <label>Settings file:</label>
          <aside className={classes!.actions}>
            <Button className={classes!.button} btnSize={Size.XXSMALL} onClick={this.props.exportSettingsFile}>Export…</Button>
            <Button className={classes!.button} btnSize={Size.XXSMALL} onClick={this.props.importSettingsFile}>Import…</Button>
          </aside>
        </div>

        {sync.message && (
          <p className={`${classes!.status} ${sync.isError ? classes!.error : ''}`}>{sync.message}</p>
        )}
      </section>
    );
  }
}

export default connect(
  (state: StationState) => ({ sync: getSettingsSync(state) }),
  dispatch => bindActionCreators({
    chooseSyncFolder, disableSync, syncNow, exportSettingsFile, importSettingsFile,
  }, dispatch)
)(SettingsSyncImpl as any) as React.ComponentType<{}>;
