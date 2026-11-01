// Host deployment: PostgreSQL in Compose, NestJS under PM2/systemd, static dist
// served by the existing web server. Never restart unrelated applications.
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { landingBuildEnv } = require('./build-landing.cjs');

const root = path.resolve(__dirname, '..');
process.chdir(root);
const compose = process.argv.slice(2);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] || ''} failed (exit ${result.status})`);
  return result.stdout;
}
function capture(command, args) {
  return run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function processManager() {
  if (process.env.SYSTEMD_BACKEND_SERVICE) {
    const service = process.env.SYSTEMD_BACKEND_SERVICE;
    if (!/^[\w@.-]+\.service$/.test(service)) throw new Error('Invalid SYSTEMD_BACKEND_SERVICE');
    if (capture('systemctl', ['show', service, '--property=LoadState', '--value']) !== 'loaded') throw new Error('Backend systemd service is not loaded');
    return () => run('systemctl', ['restart', service]);
  }
  const pm2 = spawnSync('pm2', ['jlist'], { encoding: 'utf8' });
  if (pm2.status === 0) {
    const apps = JSON.parse(pm2.stdout);
    const candidates = apps.filter(app => {
      if (process.env.PM2_BACKEND_APP) return app.name === process.env.PM2_BACKEND_APP;
      const cwd = app.pm2_env?.pm_cwd;
      const script = app.pm2_env?.pm_exec_path;
      return cwd && script && [root, path.join(root, 'backend')].includes(path.resolve(cwd)) &&
        (path.resolve(script) === path.join(root, 'backend/dist/main.js') ||
         (path.resolve(cwd) === path.join(root, 'backend') && /[/\\](npm|npm-cli\.js)$/.test(script)));
    });
    const names = [...new Set(candidates.map(app => app.name))];
    if (names.length === 1) return () => run('pm2', ['restart', names[0], '--update-env']);
  }
  // Discover only units whose working directory belongs to this checkout.
  const units = spawnSync('systemctl', ['list-units', '--type=service', '--all', '--no-legend', '--plain'], { encoding: 'utf8' });
  if (units.status === 0) {
    const matches = units.stdout.trim().split('\n').map(line => line.trim().split(/\s+/)[0]).filter(unit => {
      if (!/^[\w@.-]+\.service$/.test(unit)) return false;
      const cwd = capture('systemctl', ['show', unit, '--property=WorkingDirectory', '--value']);
      return cwd === path.join(root, 'backend') ||
        (cwd === root && capture('systemctl', ['show', unit, '--property=ExecStart', '--value']).includes('backend/dist/main.js'));
    });
    if (matches.length === 1) return () => run('systemctl', ['restart', matches[0]]);
  }
  throw new Error('Cannot identify backend process. Set PM2_BACKEND_APP or SYSTEMD_BACKEND_SERVICE in deployment environment.');
}
async function main() {
  // Node's dotenv reader supports quoted values without evaluating shell code.
  const backendEnv = path.resolve(process.env.BACKEND_ENV_FILE || 'backend/.env');
  if (existsSync(backendEnv)) process.loadEnvFile(backendEnv);
  const engineDir = path.join(root, '.deploy/prisma');
  if (existsSync(engineDir)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(engineDir, 'libquery_engine-debian-openssl-3.0.x.so.node');
    process.env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(engineDir, 'schema-engine-debian-openssl-3.0.x');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (backend/.env or BACKEND_ENV_FILE)');
  const restart = processManager(); // Resolve before any installation or migration.
  console.log('Starting existing PostgreSQL Compose service...');
  run('docker', [...compose, 'up', '-d', 'postgres']);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = spawnSync('docker', [...compose, 'exec', '-T', 'postgres', 'sh', '-c',
      'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { stdio: 'ignore' });
    if (result.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!ready) throw new Error('PostgreSQL is not ready');
  run('npm', ['--prefix', 'frontend', 'ci']);
  run('npm', ['--prefix', 'frontend', 'run', 'build']);
  run('npm', ['--prefix', 'landing', 'ci']);
  const landingEnv = landingBuildEnv({ services: { backend: { environment: process.env } } });
  run('npm', ['--prefix', 'landing', 'run', 'build'], { env: landingEnv });
  // Use only the repository's pinned Prisma; npx may install an incompatible major.
  run('npm', ['--prefix', 'backend', 'ci', '--ignore-scripts']);
  const cli = path.join(root, 'backend/node_modules/prisma/build/index.js');
  const version = require('../backend/node_modules/prisma/package.json').version;
  if (version !== require('../backend/package.json').dependencies.prisma) throw new Error('Prisma CLI version differs from package.json');
  const migrate = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { cwd: path.join(root, 'backend'), stdio: 'inherit' });
  if (migrate.status !== 0) {
    console.log('Prisma migrate unavailable; checking the restricted VK SQL recovery path...');
    run(process.execPath, ['scripts/migrate-vk-sql.cjs', ...compose]);
  }
  run(process.execPath, [cli, 'generate'], { cwd: path.join(root, 'backend') });
  run('npm', ['--prefix', 'backend', 'run', 'build']);
  restart();
  const base = process.env.DEPLOY_API_URL || 'http://127.0.0.1:3000/api';
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      if (response.status === 200) { healthy = true; break; }
    } catch { /* service may still be starting */ }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!healthy) throw new Error('Backend health did not return HTTP 200');
  run(process.execPath, [path.join(root, 'scripts/check-deployed-api.cjs')], { cwd: path.join(root, 'backend') });
  console.log(`Deployment successful: ${new Date().toISOString()} - commit ${capture('git', ['rev-parse', '--short', 'HEAD'])}`);
}
main().catch(error => { console.error(`Deployment failed: ${error.message}`); process.exitCode = 1; });
