// Run only against audit-20261019.cjs with AUDIT_SERVE=1. Synthetic credentials only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3000';
async function login(email) {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email, password: 'audit-test-password' }) });
  assert.equal(response.status, 200, 'Synthetic audit login failed');
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}
async function call(url, cookie, method = 'GET', body) {
  return fetch(`${base}${url}`, { method, headers: { cookie, origin: base, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
(async () => {
  const admin = await login('audit-admin@test.local');
  const profiles = (await (await call('/api/staff', admin)).json()).data;
  const a = profiles.find(row => row.fullName === 'Тренер А');
  assert.ok(a, 'Use only the synthetic audit server');
  assert.equal((await call(`/api/staff/${a.id}`, admin, 'PATCH', { isActive: false })).status, 200);
  const trainer = await login('audit-trainer-a@test.local');
  const own = await call('/api/staff', trainer);
  // The concurrent module-permission change may now deny the staff module.
  // Authentication remains independently verified by login() above.
  assert.ok([200, 403].includes(own.status), 'Unexpected staff-module response');
  const foreign = await call(`/api/staff?staffId=${profiles.find(row => row.fullName === 'Тренер Б').id}`, trainer);
  assert.equal(foreign.status, 403);
  const form = new FormData();
  form.set('file', new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'synthetic-header-only.png');
  const upload = await fetch(`${base}/api/upload/image`, { method: 'POST', headers: { cookie: trainer, origin: base }, body: form });
  assert.equal(upload.status, 201);
  const { url } = await upload.json();
  assert.match(url, /^\/uploads\/[0-9a-f-]+\.png$/);
  const publicFile = await fetch(`${base}${url}`);
  assert.equal(publicFile.status, 200);
  const target = path.resolve(__dirname, '..', url.slice(1));
  assert.ok(target.startsWith(path.resolve(__dirname, '../uploads') + path.sep));
  fs.unlinkSync(target);
  const results = [
    { finding: 'AUTH-01', description: 'Inactive StaffProfile does not disable authentication', activeStaff: false, freshLoginStatus: 200, ownProfileStatus: own.status },
    { check: 'Foreign staff privacy', status: foreign.status, result: 'PASS' },
    { finding: 'UPLOAD-01', description: 'Trainer can publish an 8-byte PNG header; file is anonymously accessible', uploadStatus: upload.status, anonymousReadStatus: publicFile.status, syntheticFileDeleted: true },
  ];
  fs.writeFileSync(path.join(__dirname, '../../docs/audits/2026-10-19/http-reproductions.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error.name, error.message); process.exitCode = 1; });
