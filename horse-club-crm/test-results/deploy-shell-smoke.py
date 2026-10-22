"""Exercise deploy.sh fail-fast behavior without Docker, npm installs or network."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
bash = 'C:/Program Files/Git/bin/bash.exe'
with tempfile.TemporaryDirectory(dir=root / 'test-results', prefix='deploy-shell-') as fixture:
    env_script = Path(fixture) / 'mock-env.sh'
    env_script.write_text('''
git() { echo abc123; }
npm() { echo "MOCK npm $*"; [[ "$FAIL_STAGE" != frontend || "$*" != *"run build"* ]]; }
node() { cat >/dev/null; [[ "$FAIL_STAGE" != pipeline ]]; }
docker() {
    echo "MOCK docker $*" >&2
    if [[ "$*" == *"config --format json"* ]]; then echo '{}'; fi
    case "$FAIL_STAGE" in
      config) [[ "$*" != *"config --quiet"* ]] ;;
      backend) [[ "$*" != *"up -d --build --wait backend"* ]] ;;
      caddy) [[ "$*" != *"up -d --force-recreate caddy"* ]] ;;
      *) return 0 ;;
    esac
}
''', encoding='utf-8')
    for stage in ['success', 'config', 'pipeline', 'frontend', 'backend', 'caddy']:
        env = dict(os.environ, BASH_ENV=env_script.as_posix(), FAIL_STAGE=stage)
        result = subprocess.run([bash, str(root / 'deploy.sh')], env=env, capture_output=True, text=True)
        output = result.stdout + result.stderr
        if stage == 'success':
            assert result.returncode == 0, output
            assert 'Deployment successful:' in output and 'commit abc123' in output
        else:
            assert result.returncode != 0, output
            assert 'Deployment failed:' in output and 'command:' in output, output
            assert 'Deployment successful:' not in output
            if stage != 'caddy':
                assert 'MOCK docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate caddy' not in output
        print(f'deploy.sh {stage}: passed')
