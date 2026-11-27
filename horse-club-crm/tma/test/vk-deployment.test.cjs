const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('Caddy serves one VK entry with VK framing scoped to Mini App only', () => {
  const config = read('docker/Caddyfile');
  assert.match(config, /X-Frame-Options DENY/);
  const vk = config.slice(config.indexOf('handle @vkApp'), config.indexOf('root * /var/www/landing-dist'));
  assert.match(vk, /header -X-Frame-Options/);
  for (const domain of ['https://vk.com', 'https://*.vk.com', 'https://m.vk.com', 'https://vk.ru', 'https://*.vk.ru', 'https://*.vk-apps.com']) assert.ok(vk.includes(domain));
  assert.match(vk, /try_files \{path\} \/vk-app\/index.html/);
  assert.doesNotMatch(vk, /staff|strip_prefix|\/tma/);
});
test('VK build and gateway have no separate staff entry or second authorization', () => {
  assert.match(read('frontend/vite.vk.config.ts'), /base: '\/vk-app\/'/);
  assert.doesNotMatch(read('frontend/vite.vk.config.ts'), /\/staff/);
  assert.doesNotMatch(read('frontend/src/tma/useTelegramWebApp.ts'), /vkStaffBootstrap|vk-mini-app/);
  assert.doesNotMatch(read('tma/src/App.tsx'), /\/vk-app\/staff/);
  assert.match(read('frontend/src/tma/VkMiniApp.tsx'), /<StaffApp session=\{session\}/);
});
