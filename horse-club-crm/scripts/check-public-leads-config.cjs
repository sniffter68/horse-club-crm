// Read resolved Compose JSON, never print the full environment (it contains secrets).
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let config;
  try {
    config = JSON.parse(input);
  } catch {
    console.error('Cannot parse resolved Compose JSON; configuration values are omitted.');
    process.exitCode = 1;
    return;
  }
  try {
    if (config.services?.backend?.environment?.PUBLIC_LEADS_ENABLED !== 'true') {
      throw new Error('PUBLIC_LEADS_ENABLED must be exactly true in the backend environment. Set PUBLIC_LEADS_ENABLED=true in the deployment env file and recreate backend.');
    }
    console.log('Public leads enabled in resolved backend configuration.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cannot validate public leads configuration');
    process.exitCode = 1;
  }
});
