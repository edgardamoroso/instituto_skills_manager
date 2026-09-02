// Testa os ramos de produção de config.js e securityHeaders.js em processo próprio.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.SMTP_HOST = '';
process.env.ADMIN_PASSWORD = 'uma-senha-bem-forte';
process.env.PUBLIC_URL = 'https://exemplo.com.br';
process.env.TRUST_PROXY = '2';

test('config de produção: isProduction, trustProxy numérico, cookie __Host-', async () => {
  const { config } = await import('../../src/lib/config.js?prod=1');
  assert.equal(config.isProduction, true);
  assert.equal(config.trustProxy, 2);
  assert.equal(config.cookieName, '__Host-sm_session');
});

test('assertProductionConfig passa com configuração válida', async () => {
  const { assertProductionConfig } = await import('../../src/lib/config.js?prod=1');
  assert.doesNotThrow(() => assertProductionConfig());
});

test('securityHeaders em produção adiciona HSTS; forceHttps redireciona', async () => {
  const { securityHeaders, forceHttps } = await import('../../src/middleware/securityHeaders.js?prod=1');
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    redirect(code, url) { this.code = code; this.url = url; },
  };
  securityHeaders({}, res, () => {});
  assert.match(res.headers['strict-transport-security'], /max-age=/);

  forceHttps({ headers: { host: 'exemplo.com.br', 'x-forwarded-proto': 'http' }, originalUrl: '/x', secure: false }, res, () => {
    throw new Error('não deveria chamar next');
  });
  assert.equal(res.code, 308);
  assert.equal(res.url, 'https://exemplo.com.br/x');
});
