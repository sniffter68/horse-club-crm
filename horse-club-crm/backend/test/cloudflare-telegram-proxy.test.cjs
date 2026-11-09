const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const worker = import('data:text/javascript;base64,' + readFileSync(resolve(__dirname, '../../deploy/cloudflare-tg-proxy.js')).toString('base64'));
const token = '123:test-token-only';
const env = { TELEGRAM_BOT_TOKEN: token };
const endpoint = `https://proxy.example/bot${token}`;

test('Worker restricts token, path and method without forwarding rejected requests', async t => {
  const { default: proxy } = await worker;
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not reach upstream'); });
  for (const [url, options, config, expected] of [
    [endpoint + '/getMe', {}, {}, 503],
    ['https://proxy.example/botwrong/getMe', {}, env, 404],
    [endpoint + '/getMe/extra', {}, env, 404],
    [endpoint + '/getMe', { method: 'DELETE' }, env, 405],
  ]) assert.equal((await proxy.fetch(new Request(url, options), config)).status, expected);
  assert.equal(fetch.mock.callCount(), 0);
});

test('Worker forwards long polling POST and query to fixed Telegram host, preserving JSON error status', async t => {
  const { default: proxy } = await worker;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, `https://api.telegram.org/bot${token}/getUpdates?timeout=30`);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.get('authorization'), null);
    assert.equal(await new Response(options.body).text(), '{"offset":12}');
    return new Response('{"ok":false,"error_code":409}', { status: 409 });
  });
  const response = await proxy.fetch(new Request(endpoint + '/getUpdates?timeout=30', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'private' }, body: '{"offset":12}',
  }), env);
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).error_code, 409);
});

test('Worker hides network exceptions and rejects upstream redirects', async t => {
  const { default: proxy } = await worker;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error(endpoint); });
  let response = await proxy.fetch(new Request(endpoint + '/getMe'), env);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(token));
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }));
  response = await proxy.fetch(new Request(endpoint + '/getMe'), env);
  assert.equal(response.status, 502);
});
