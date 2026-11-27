const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function bridgeFixture({ denied = false, status = 200, result = { status: 'LINKED', role: 'CLIENT', access_token: 'jwt', clientId: 'client' } } = {}) {
  const calls = [];
  const requests = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/platform/bridge.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: name => {
      if (name === '@vkontakte/vk-bridge') return { __esModule: true, default: { send: async (method, params) => {
        calls.push({ method, params });
        if (denied) throw new Error('Denied');
        return { phone_number: '79991234567', sign: 'signed-phone' };
      } } };
      if (name === '../telegram') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    window: { location: { hostname: 'horseclub68.ru', search: '?vk_user_id=123&sign=launch', pathname: '/vk-app/' } },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: status === 200, json: async () => result }; },
    AbortSignal, URLSearchParams, setTimeout,
  });
  return { bridge: exports, calls, requests };
}

test('native VK phone is forwarded with signature and launch params, no manual code', async () => {
  const { bridge, calls, requests } = bridgeFixture();
  const result = await bridge.linkVkPhone();
  assert.equal(result.token, 'jwt');
  assert.equal(calls[0].method, 'VKWebAppGetPhoneNumber');
  assert.equal(requests[0].url, 'https://crm.horseclub68.ru/api/auth/vk-mini-app/link-by-vk');
  assert.equal(requests[0].options.credentials, 'include');
  assert.deepEqual(JSON.parse(requests[0].options.body), { launchParams: '?vk_user_id=123&sign=launch', phone: '79991234567', phoneToken: 'signed-phone' });
});

test('VK denial does not send a linking request', async () => {
  const { bridge, requests } = bridgeFixture({ denied: true });
  await assert.rejects(bridge.linkVkPhone(), /VK/);
  assert.equal(requests.length, 0);
});

test('unlinked login retains server verified ID and uses ordinary login route', async () => {
  const { bridge, requests } = bridgeFixture({ result: { status: 'UNLINKED', vkUserId: 'verified-id' } });
  const result = await bridge.vkAuthenticate();
  assert.equal(result.vkUserId, 'verified-id');
  assert.equal(requests[0].url.endsWith('/vk-mini-app'), true);
});

test('CRM error is shown and staff roles enter staff flow', async () => {
  const failure = bridgeFixture({ status: 409, result: { message: 'Phone conflict' } });
  await assert.rejects(failure.bridge.linkVkPhone(), /Phone conflict/);
  const staff = bridgeFixture({ result: { status: 'LINKED', role: 'MANAGER', access_token: 'staff-jwt' } });
  assert.equal((await staff.bridge.linkVkPhone()).role, 'STAFF');
  await staff.bridge.copyVkId('123');
  assert.equal(staff.calls[1].method, 'VKWebAppCopyText');
  assert.equal(staff.calls[1].params.text, '123');
});
