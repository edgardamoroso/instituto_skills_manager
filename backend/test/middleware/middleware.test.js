import '../helpers/harness.js';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, consume, reset, resetAll } from '../../src/middleware/rateLimit.js';
import { sameOrigin } from '../../src/middleware/sameOrigin.js';
import { securityHeaders, forceHttps } from '../../src/middleware/securityHeaders.js';
import { wrap, errorHandler } from '../../src/lib/http.js';
import { badRequest, AppError } from '../../src/lib/errors.js';

beforeEach(() => resetAll());

function fakeRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    redirect(code, url) { this.statusCode = code; this.headers.location = url; return this; },
  };
}

test('rateLimit deixa passar até o limite e depois bloqueia com Retry-After', () => {
  const mw = rateLimit({ name: 'x', limit: 2, windowMs: 1000 });
  const req = { ip: '1.1.1.1' };
  const errors = [];
  const next = (e) => errors.push(e);

  mw(req, fakeRes(), next);
  mw(req, fakeRes(), next);
  const res = fakeRes();
  mw(req, res, next);

  assert.equal(errors.filter(Boolean).length, 1);
  assert.equal(errors.find(Boolean).status, 429);
  assert.ok(res.headers['retry-after']);
});

test('consume lança AppError 429 ao estourar; reset limpa a chave', () => {
  consume('k', 1, 1000);
  assert.throws(() => consume('k', 1, 1000), (e) => e instanceof AppError && e.status === 429);
  reset('k');
  assert.doesNotThrow(() => consume('k', 1, 1000));
});

test('sameOrigin: métodos seguros passam; origem ausente/divergente barram', () => {
  const next = (e) => e;
  assert.equal(sameOrigin({ method: 'GET', headers: {} }, fakeRes(), (e) => e), undefined);

  let err;
  sameOrigin({ method: 'POST', headers: {} }, fakeRes(), (e) => { err = e; });
  assert.equal(err.code, 'ORIGIN_REQUIRED');

  sameOrigin({ method: 'POST', headers: { origin: 'https://malicioso.com', host: 'localhost:3000' } }, fakeRes(), (e) => { err = e; });
  assert.equal(err.code, 'ORIGIN_MISMATCH');

  let ok = 'nao chamado';
  sameOrigin({ method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }, fakeRes(), () => { ok = 'chamado'; });
  assert.equal(ok, 'chamado');
});

test('securityHeaders define CSP e afins; HSTS só em produção', () => {
  const res = fakeRes();
  securityHeaders({}, res, () => {});
  assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['strict-transport-security'], undefined); // NODE_ENV=test
});

test('forceHttps: fora de produção não redireciona', () => {
  const res = fakeRes();
  let called = false;
  forceHttps({ headers: {}, secure: false }, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('wrap encaminha erros síncronos e assíncronos ao next', async () => {
  const next1 = [];
  wrap(() => { throw badRequest('SYNC'); })({}, fakeRes(), (e) => next1.push(e));
  assert.equal(next1[0].code, 'SYNC');

  const next2 = [];
  await wrap(async () => { throw badRequest('ASYNC'); })({}, fakeRes(), (e) => next2.push(e));
  await new Promise((r) => setImmediate(r));
  assert.equal(next2[0].code, 'ASYNC');
});

test('errorHandler: 4xx devolve o código; 5xx esconde o detalhe', () => {
  const res4 = fakeRes();
  errorHandler(badRequest('BOOM'), { method: 'GET', originalUrl: '/x' }, res4, () => {});
  assert.equal(res4.statusCode, 400);
  assert.deepEqual(res4.body, { error: 'BOOM' });

  const res5 = fakeRes();
  errorHandler(new Error('interno'), { method: 'GET', originalUrl: '/x' }, res5, () => {});
  assert.equal(res5.statusCode, 500);
  assert.deepEqual(res5.body, { error: 'INTERNAL_ERROR' });
});
