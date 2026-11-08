const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../frontend/dist/tma');
const assets = fs.readdirSync(path.join(root, 'assets')).filter(name => /\.(js|css)$/.test(name));
let raw = 0, gzip = 0;
for (const name of assets) {
  const bytes = fs.readFileSync(path.join(root, 'assets', name));
  raw += bytes.length;
  gzip += zlib.gzipSync(bytes).length;
  if (/refinedev|antd/.test(bytes.toString())) throw new Error('CRM dependencies found in TMA');
}
console.log(`TMA JS + CSS: ${raw} bytes raw; ${gzip} bytes gzip (Telegram SDK excluded)`);
if (raw >= 150_000) throw new Error('TMA exceeds the 150 KB uncompressed JS + CSS budget');
