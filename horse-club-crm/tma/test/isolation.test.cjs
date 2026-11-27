const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('TMA dependency graph excludes CRM frameworks and keeps a strict size gate', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@vkontakte/vk-bridge', 'react', 'react-dom']);
  for (const name of fs.readdirSync(path.join(root, 'src'))) {
    if (!fs.statSync(path.join(root, 'src', name)).isFile()) continue;
    const source = fs.readFileSync(path.join(root, 'src', name), 'utf8');
    assert.doesNotMatch(source, /from ['"](?:@refinedev|antd|axios|.*frontend\/src)/);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\b/);
  }
  assert.match(fs.readFileSync(path.join(root, 'scripts/check-size.cjs'), 'utf8'), /raw >= 176_000/);
});
