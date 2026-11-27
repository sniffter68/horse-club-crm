const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('VK cross-origin reads and mutations use the CRM API and Bearer without Telegram or cookies', async () => {
  const exports = {}, requests = [];
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/api.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, require: () => ({ telegram: () => undefined, telegramRequiredError: () => new Error('No Telegram') }),
    window: { location: { hostname: 'horseclub68.ru' } }, AbortSignal,
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ok: true }) }; },
  });
  exports.setClientSession('vk-client-token');
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) await exports.api('client/overview', { method });
  for (const { url, options } of requests) {
    assert.equal(url, 'https://crm.horseclub68.ru/api/tma/client/overview');
    assert.equal(options.headers.Authorization, 'Bearer vk-client-token');
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers['X-Telegram-Init-Data'], undefined);
  }
});
