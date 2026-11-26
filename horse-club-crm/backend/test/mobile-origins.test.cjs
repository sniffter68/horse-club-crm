const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestLimits } = require('../dist/common/request-limits');
const { trustedOrigins, corsOptions } = require('../dist/common/trusted-origins');
const { sessionCookieOptions, refreshCookieOptions } = require('../dist/auth/session-cookie');

test('CORS preflight supports native credentials and Authorization; foreign mutations stay forbidden', async () => {
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const request = require('supertest');
  class ProbeModule {}
  Module({})(ProbeModule);
  const app = await NestFactory.create(ProbeModule, { logger: false });
  app.enableCors(corsOptions);
  app.use(requestLimits());
  app.use('/api/probe', (_req, res) => res.setHeader('X-Total-Count', '3').json({ ok: true }));
  await app.init();
  try {
    for (const origin of trustedOrigins) {
      const preflight = await request(app.getHttpServer()).options('/api/probe').set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Content-Type,Authorization').expect(204);
      assert.equal(preflight.headers['access-control-allow-origin'], origin);
      assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
      assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
      const result = await request(app.getHttpServer()).post('/api/probe').set('Origin', origin).expect(200);
      assert.match(result.headers['access-control-expose-headers'], /X-Total-Count/);
    }
    const denied = await request(app.getHttpServer()).post('/api/probe').set('Origin', 'https://evil.example').expect(403);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  } finally { await app.close(); }
});

function mutation(origin, cookie) {
  let status = 200;
  let passed = false;
  requestLimits()({ method: 'POST', headers: { origin, cookie }, protocol: 'https',
    get: () => 'crm.horseclub68.ru', path: '/api/clients', ip: '127.0.0.1', socket: {} },
  { setHeader() {}, status(value) { status = value; return this; }, json() {} }, () => { passed = true; });
  return { status, passed };
}

test('native and production origins can mutate; foreign and missing cookie origins cannot', () => {
  for (const origin of trustedOrigins) assert.deepEqual(mutation(origin), { status: 200, passed: true });
  for (const origin of ['https://evil.example', 'https://localhost.evil.example', 'null']) {
    assert.deepEqual(mutation(origin), { status: 403, passed: false });
  }
  assert.deepEqual(mutation(undefined, 'horsecrm-session=secret; __Host-horsecrm-session=secret'), { status: 403, passed: false });
});

test('production cross-site cookies are limited to trusted native origins, including refresh', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const origin of trustedOrigins.filter(value => value !== 'https://crm.horseclub68.ru')) {
      assert.equal(sessionCookieOptions(origin).sameSite, 'none');
      assert.equal(refreshCookieOptions(origin).sameSite, 'none');
      assert.equal(sessionCookieOptions(origin).secure, true);
      assert.equal(sessionCookieOptions(origin).httpOnly, true);
    }
    for (const origin of [undefined, 'https://crm.horseclub68.ru', 'https://evil.example']) {
      assert.equal(sessionCookieOptions(origin).sameSite, 'strict');
    }
    process.env.NODE_ENV = 'development';
    assert.equal(sessionCookieOptions('https://localhost').sameSite, 'strict');
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
