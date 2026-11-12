import { Switcher } from '@getstation/theme';
import * as remote from '@electron/remote';
import log from 'electron-log';
import * as React from 'react';
// @ts-ignore: no declaration file
import injectSheet from 'react-jss';

import { readLaunchSettings, writeLaunchSettings } from '../../../launch-settings';

export interface Classes {
  container: string,
  item: string,
  settingName: string,
  label: string,
  description: string,
}

export interface Props {
  classes?: Classes,
}

interface State {
  singleInstance: boolean,
}

const styles = {
  container: {
    maxWidth: '600px',
    paddingTop: '10px',
    paddingBottom: '10px',
  },
  item: {
  },
  settingName: {
    marginBottom: 8,
    textTransform: 'uppercase',
    fontSize: 14,
    fontWeight: 'bold',
  },
  label: {
  },
  description: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    lineHeight: '16px',
  },
};

/**
 * Stored in a JSON file rather than the database because the main process
 * needs it before anything else boots (see `launch-settings.ts`).
 */
@injectSheet(styles)
export class SettingsSingleInstance extends React.Component<Props, State> {
  state: State = { singleInstance: readLaunchSettings().singleInstance };

  handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const singleInstance = e.target.checked;
    try {
      writeLaunchSettings({ singleInstance });
    } catch (err) {
      log.error('[settings] could not save launch settings', err);
      return;
    }
    // Apply right away so it doesn't wait for a restart. If another instance
    // already holds the lock, this one stays independent until it restarts.
    if (singleInstance) {
      remote.app.requestSingleInstanceLock();
    } else {
      remote.app.releaseSingleInstanceLock();
    }
    this.setState({ singleInstance });
  }

  render() {
    const { classes } = this.props;

    return (
      <div className={classes!.container}>
        <div className={classes!.item}>
          <p className={classes!.settingName}>Single window</p>
          <Switcher
            checked={this.state.singleInstance}
            onChange={this.handleChange}
          />
          <div className={classes!.label}>
            Reuse the open window when launching the app again
          </div>
          <div className={classes!.description}>
            When off, each click on a shortcut opens a separate copy of the app.
          </div>
        </div>
      </div>
    );
  }
}

export default SettingsSingleInstance;
