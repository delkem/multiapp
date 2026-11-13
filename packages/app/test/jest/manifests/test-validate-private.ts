import { validatePrivateApplicationRequest } from '../../../manifests/validate-private';

const valid = {
  name: 'Intranet',
  themeColor: '#123456',
  bxIconURL: 'https://intranet.example/logo.png',
  startURL: 'https://intranet.example/',
  scope: 'https://intranet.example/',
};

describe('validatePrivateApplicationRequest', () => {
  it('accepts a web app', () => {
    expect(() => validatePrivateApplicationRequest(valid)).not.toThrow();
    expect(() => validatePrivateApplicationRequest({ ...valid, startURL: 'http://10.0.0.2:8080/' })).not.toThrow();
    expect(() => validatePrivateApplicationRequest({ ...valid, bxIconURL: 'data:image/png;base64,AAAA' }))
      .not.toThrow();
  });

  it.each([
    'file:///C:/Windows/System32/cmd.exe',
    'station://appstore',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'intranet.example',
    '',
  ])('refuses start URL %s', (startURL) => {
    expect(() => validatePrivateApplicationRequest({ ...valid, startURL })).toThrow(TypeError);
  });

  it.each([
    'file:///C:/secret.png',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
  ])('refuses icon URL %s', (bxIconURL) => {
    expect(() => validatePrivateApplicationRequest({ ...valid, bxIconURL })).toThrow(TypeError);
  });
});
