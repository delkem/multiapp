import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DEFAULT_LAUNCH_SETTINGS, readLaunchSettings, writeLaunchSettings } from '../../../src/launch-settings';

describe('launch settings', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-settings-'));
    file = path.join(dir, 'launch-settings.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('defaults to single instance when no file exists', () => {
    expect(readLaunchSettings(file)).toEqual(DEFAULT_LAUNCH_SETTINGS);
    expect(DEFAULT_LAUNCH_SETTINGS.singleInstance).toBe(true);
  });

  it('round-trips a written value', () => {
    writeLaunchSettings({ singleInstance: false }, file);
    expect(readLaunchSettings(file).singleInstance).toBe(false);

    writeLaunchSettings({ singleInstance: true }, file);
    expect(readLaunchSettings(file).singleInstance).toBe(true);
  });

  it('falls back to defaults on a corrupt file', () => {
    fs.writeFileSync(file, '{not json');
    expect(readLaunchSettings(file)).toEqual(DEFAULT_LAUNCH_SETTINGS);
  });

  it('ignores values of the wrong type', () => {
    fs.writeFileSync(file, JSON.stringify({ singleInstance: 'no' }));
    expect(readLaunchSettings(file).singleInstance).toBe(true);
  });
});
