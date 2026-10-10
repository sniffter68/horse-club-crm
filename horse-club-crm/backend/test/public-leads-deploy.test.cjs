const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const script = path.resolve(__dirname, '../../scripts/check-public-leads-config.cjs');

for (const flag of ['true', 'false', undefined, 'TRUE', ' true ']) {
  test(`deployment public-lead preflight checks the resolved container flag ${JSON.stringify(flag)}`, () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', input: JSON.stringify({ services: {
      backend: { environment: { PUBLIC_LEADS_ENABLED: flag, VK_COMMUNITY_TOKEN: 'must-not-appear-in-output' } },
    } }) });
    assert.equal(result.status, flag === 'true' ? 0 : 1);
    assert.doesNotMatch(result.stdout + result.stderr, /must-not-appear-in-output/);
    if (flag !== 'true') assert.match(result.stderr, /Set PUBLIC_LEADS_ENABLED=true/);
  });
}

test('deployment preflight rejects malformed Compose JSON without leaking its input', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', input: 'secret-not-json' });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /secret-not-json/);
});
