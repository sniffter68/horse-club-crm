const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/deadline.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: output, AbortController, setTimeout, clearTimeout, Error, Promise });
const { withDeadline } = output;

test('hung work times out and aborts its request without modern AbortSignal static APIs', async () => {
  let signal;
  await assert.rejects(withDeadline(value => { signal = value; return new Promise(() => {}); }, undefined, 10), /вовремя/);
  assert.equal(signal.aborted, true);
});
test('caller cancellation interrupts pending work', async () => {
  const controller = new AbortController();
  const pending = withDeadline(() => new Promise(() => {}), controller.signal, 1000);
  controller.abort(new Error('cancelled by caller'));
  await assert.rejects(pending, /cancelled by caller/);
});
test('successful work is not aborted later', async () => {
  let signal;
  assert.equal(await withDeadline(value => { signal = value; return Promise.resolve(42); }, undefined, 10), 42);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(signal.aborted, false);
});
