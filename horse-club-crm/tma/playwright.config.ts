import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', fullyParallel: true, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175/tma/', screenshot: 'only-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium' } }],
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175', url: 'http://127.0.0.1:5175/tma/', reuseExistingServer: false },
});
