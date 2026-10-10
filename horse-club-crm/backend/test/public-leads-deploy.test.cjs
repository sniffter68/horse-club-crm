const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const script = path.resolve(__dirname, '../../scripts/check-public-leads-config.cjs');
const { landingBuildEnv } = require('../../scripts/build-landing.cjs');
const { currentLeadConsentVersion } = require('../dist/common/lead-consent');

for (const configured of [undefined, '', '  ', '2026-09-19', '  2026-10-10  ']) {
  test(`landing build and backend resolve the same consent for ${JSON.stringify(configured)}`, () => {
    const original = process.env.LEAD_CONSENT_VERSION;
    if (configured === undefined) delete process.env.LEAD_CONSENT_VERSION; else process.env.LEAD_CONSENT_VERSION = configured;
    try {
      const env = landingBuildEnv({ services: { backend: { environment: { LEAD_CONSENT_VERSION: configured } } } },
        { VITE_LEGAL_CONSENT_VERSION: 'stale-build-value', VITE_API_URL: '  /api  ' });
      assert.equal(env.VITE_LEGAL_CONSENT_VERSION, currentLeadConsentVersion());
      assert.equal(env.VITE_API_URL, '/api');
    } finally {
      if (original === undefined) delete process.env.LEAD_CONSENT_VERSION; else process.env.LEAD_CONSENT_VERSION = original;
    }
  });
}

test('landing builder sets the same-origin API fallback and rejects invalid consent configuration', () => {
  assert.equal(landingBuildEnv({}, {}).VITE_API_URL, '/api');
  assert.throws(() => landingBuildEnv({ services: { backend: { environment: { LEAD_CONSENT_VERSION: 'wrong version' } } } }), /Invalid backend/);
});

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
