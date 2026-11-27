import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.TMA_E2E_PORT ?? '5175');
const baseURL = `http://127.0.0.1:${port}/tma/`;

export default defineConfig({
  testDir: './e2e', fullyParallel: true, reporter: 'list',
  use: { baseURL, screenshot: 'only-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['iPhone SE'], viewport: { width: 390, height: 844 }, defaultBrowserType: 'chromium', channel: 'msedge' } }],
  webServer: process.env.TMA_E2E_EXTERNAL_SERVER ? undefined : { command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort --outDir ../frontend/dist`, url: baseURL, reuseExistingServer: false },
});
