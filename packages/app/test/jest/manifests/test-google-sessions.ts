import * as fs from 'fs';
import * as path from 'path';

const definitionsDir = path.resolve(__dirname, '../../../manifests/definitions');

const googleAccountManifests = fs.readdirSync(definitionsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => ({ file: f, manifest: JSON.parse(fs.readFileSync(path.join(definitionsDir, f), 'utf8')) }))
  .filter(({ manifest }) => {
    const config = manifest.bx_multi_instance_config;
    return config && (config.preset === 'google-account' || (config.presets || []).includes('google-account'));
  });

describe('Google account apps', () => {
  it('are found', () => {
    expect(googleAccountManifests.length).toBeGreaterThan(10);
  });

  // Each instance must get its own `persist:<applicationId>` partition so that
  // e.g. two Gmail apps (or Gmail and Calendar) can be signed in to different Google accounts.
  it.each(googleAccountManifests.map(({ file, manifest }) => [`${manifest.name} (${file})`, manifest]))(
    '%s uses an isolated session',
    (_name, manifest: any) => {
      expect(manifest.bx_use_default_session).not.toBe(true);
    }
  );
});
