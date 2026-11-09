// Run inside the backend container: node < scripts/check-telegram.cjs
// Never print Telegram errors: they can contain the token in the request URL.
const { Bot } = require('grammy');

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
  const bot = new Bot(token, { client: { ...(apiRoot ? { apiRoot } : {}), timeoutSeconds: 10 } });
  await bot.api.getMe();
  console.log(`Telegram getMe: OK (${apiRoot ? 'custom API root' : 'default API root'})`);
  const base = `http://127.0.0.1:${process.env.PORT || '3000'}`;
  for (const [path, expected] of [['/api/health', 200], ['/api/tma/services', 401]]) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
    if (response.status !== expected) throw new Error('Unexpected backend status');
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Expected JSON');
    console.log(`${path}: ${expected} OK`);
  }
}

main().catch(() => {
  console.error('Telegram smoke check failed. Check token, API root, proxy connectivity and backend health. Credentials omitted.');
  process.exitCode = 1;
});
