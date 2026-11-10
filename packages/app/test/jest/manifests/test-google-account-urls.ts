import * as fs from 'fs';
import * as path from 'path';
import { formatNewPageUrl, formatStartUrl } from '../../../src/applications/helpers';

const definitionsDir = path.resolve(__dirname, '../../../manifests/definitions');
const EMAIL = 'someone@example.com';

const googleAccountManifests = fs.readdirSync(definitionsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => ({ file: f, manifest: JSON.parse(fs.readFileSync(path.join(definitionsDir, f), 'utf8')) }))
  .filter(({ manifest }) => {
    const config = manifest.bx_multi_instance_config;
    return config && (config.preset === 'google-account' || (config.presets || []).includes('google-account'));
  });

/** The URL the app ends up on: the `continue` target of an AddSession sign-in URL, or the URL itself. */
const landingURL = (url: string) => {
  const parsed = new URL(url);
  if (parsed.host === 'accounts.google.com' && parsed.pathname === '/AddSession') {
    return new URL(parsed.searchParams.get('continue')!);
  }
  return parsed;
};

// Only these Google apps accept an account email in the URL path (e.g. mail.google.com/mail/u/<email>).
// Drive (/drive/u/<email>), Calendar (/calendar/b/<email>) and Keep (/u/<email>) answer 404.
const HOSTS_ACCEPTING_EMAIL_IN_PATH = ['mail.google.com', 'chat.google.com'];

describe.each([false, true])('Google account app URLs (more than one Google account: %s)', (moreThanOneIdentity) => {
  const configData: any = { moreThanOneIdentity, userIdentity: { profileData: { email: EMAIL } } };

  it.each(googleAccountManifests.map(({ file, manifest }) => [`${manifest.name} (${file})`, manifest]))(
    '%s opens a URL Google serves for that account',
    (_name, manifest: any) => {
      for (const url of [formatStartUrl(manifest, configData), formatNewPageUrl(manifest, configData)]) {
        const landing = landingURL(url);
        if (!HOSTS_ACCEPTING_EMAIL_IN_PATH.includes(landing.host)) {
          expect(decodeURIComponent(landing.pathname)).not.toContain(EMAIL);
        }
      }
    }
  );
});

describe('Google account apps that pick the account with authuser', () => {
  const configData: any = { moreThanOneIdentity: true, userIdentity: { profileData: { email: EMAIL } } };
  const byFile = (file: string) => googleAccountManifests.find(m => m.file === file)!.manifest;

  it.each([
    ['16.json', 'drive.google.com', '/drive/'],
    ['18.json', 'calendar.google.com', '/calendar/r'],
    ['156.json', 'keep.google.com', '/'],
  ])('%s lands on %s%s for the account', (file, host, pathname) => {
    const landing = landingURL(formatStartUrl(byFile(file), configData));
    expect(landing.host).toBe(host);
    expect(landing.pathname).toBe(pathname);
    expect(landing.searchParams.get('authuser')).toBe(EMAIL);
  });

  it('Drive opens new pages for the account', () => {
    const url = new URL(formatNewPageUrl(byFile('16.json'), configData));
    expect(url.searchParams.get('authuser')).toBe(EMAIL);
  });
});
