import { isSafeExternalURL, isWebURL, openExternalSafely } from '../../../src/lib/url-safety';

describe('isSafeExternalURL', () => {
  it.each([
    'https://example.com/a?b=c',
    'http://example.com',
    'mailto:someone@example.com',
    'tel:+15551234567',
    'zoommtg://zoom.us/join?confno=123',
    'msteams:/l/meetup-join/abc',
    'slack://open',
  ])('allows %s', (url) => {
    expect(isSafeExternalURL(url)).toBe(true);
  });

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'file://attacker.example/share/payload.exe',
    'smb://attacker.example/share',
    'search-ms:query=x&crumb=location:\\\\attacker.example\\share',
    'ms-msdt:/id PCWDiagnostic',
    'ms-officecmd:{}',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '\\\\attacker.example\\share\\payload.exe',
    'not a url',
    '',
  ])('refuses %s', (url) => {
    expect(isSafeExternalURL(url)).toBe(false);
  });

  it('refuses non strings', () => {
    expect(isSafeExternalURL(undefined)).toBe(false);
    expect(isSafeExternalURL({ toString: () => 'https://example.com' })).toBe(false);
  });
});

describe('isWebURL', () => {
  it('only accepts http and https', () => {
    expect(isWebURL('https://mail.google.com/mail/u/0/#inbox')).toBe(true);
    expect(isWebURL('http://localhost:8080/')).toBe(true);
    expect(isWebURL('javascript:alert(document.cookie)')).toBe(false);
    expect(isWebURL('station://appstore')).toBe(false);
    expect(isWebURL('file:///etc/passwd')).toBe(false);
  });
});

describe('openExternalSafely', () => {
  it('opens allowed URLs', async () => {
    const open = jest.fn(() => Promise.resolve());
    await openExternalSafely('https://example.com', open);
    expect(open).toHaveBeenCalledWith('https://example.com');
  });

  it('does not open refused URLs', async () => {
    const open = jest.fn(() => Promise.resolve());
    await openExternalSafely('file:///C:/Windows/System32/calc.exe', open);
    expect(open).not.toHaveBeenCalled();
  });
});
