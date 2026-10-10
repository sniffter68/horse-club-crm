const { spawnSync } = require('node:child_process');

function landingBuildEnv(config, environment = process.env) {
  const version = String(config.services?.backend?.environment?.LEAD_CONSENT_VERSION ?? '').trim() || '2026-09-19';
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(version)) throw new Error('Invalid backend LEAD_CONSENT_VERSION');
  return { ...environment, VITE_LEGAL_CONSENT_VERSION: version, VITE_API_URL: environment.VITE_API_URL?.trim() || '/api' };
}

module.exports = { landingBuildEnv };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    let config;
    try { config = JSON.parse(input); }
    catch { console.error('Cannot parse resolved Compose configuration'); process.exitCode = 1; return; }
    try {
      const env = landingBuildEnv(config);
      console.log(`Building landing with consent version ${env.VITE_LEGAL_CONSENT_VERSION} and API ${env.VITE_API_URL}`);
      const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
      const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm --prefix landing run build'] : ['--prefix', 'landing', 'run', 'build'];
      const result = spawnSync(command, args, { env, stdio: 'inherit' });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  });
}
