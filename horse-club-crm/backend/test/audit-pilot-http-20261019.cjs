// Requires the disposable server from audit-pilot-20261019.cjs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3000';
(async () => {
  const rows = [];
  for (const role of ['admin', 'manager', 'trainer']) {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email: `pilot-${role}@test.local`, password: 'audit-test-password' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const today = '2026-10-19';
    for (const endpoint of ['/api/settings/my-permissions', '/api/vet/records', '/api/stalls/map', '/api/staff', `/api/finance/summary?from=${today}&to=${today}`, '/api/horses/workload?date=2026-10-20']) {
      const res = await fetch(base + endpoint, { headers: { cookie } });
      rows.push({ role, endpoint, status: res.status });
      if (endpoint === '/api/staff') assert.equal(res.status, 403);
      else if (endpoint.includes('/finance/') && role === 'trainer') assert.equal(res.status, 403);
      else assert.equal(res.status, 200);
    }
  }
  fs.writeFileSync(path.join(__dirname, '../../docs/audits/2026-10-19-pilot/http-access.json'), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
