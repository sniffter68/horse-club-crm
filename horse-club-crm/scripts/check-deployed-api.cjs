// Read-only smoke test, run inside the backend's environment. The short-lived
// admin token stays in memory and is never printed or persisted.
const { createHmac } = require('node:crypto');
const { createRequire } = require('node:module');
const requireBackend = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = requireBackend('@prisma/client');
async function check() {
  const base = process.env.DEPLOY_API_URL || 'http://127.0.0.1:3000/api';
  const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10000) });
  if (health.status !== 200) throw new Error(`Health HTTP ${health.status}`);
  const prisma = new PrismaClient();
  try {
    await prisma.vkIntegrationSettings.findUnique({ where: { id: 1 }, select: { id: true } });
    const user = await prisma.user.findFirst({ where: { role: 'ADMIN', crmAccess: true },
      select: { id: true, email: true, role: true, tokenVersion: true } });
    if (!user || !process.env.JWT_SECRET) throw new Error('No active admin or JWT_SECRET available for authenticated VK smoke test');
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const content = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, email: user.email,
      role: user.role, authVersion: String(user.tokenVersion), iat: now, exp: now + 60 })}`;
    const token = `${content}.${createHmac('sha256', process.env.JWT_SECRET).update(content).digest('base64url')}`;
    const response = await fetch(`${base}/settings/vk`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (response.status !== 200) throw new Error(`Authenticated VK settings HTTP ${response.status}`);
    const body = await response.json();
    if (typeof body.configured !== 'boolean' || typeof body.callbackUrl !== 'string') throw new Error('Unexpected VK settings response');
    console.log('Health HTTP 200; authenticated GET /settings/vk HTTP 200; VK settings table readable.');
  } finally { await prisma.$disconnect(); }
}
check().catch(error => { console.error(error.message); process.exitCode = 1; });
