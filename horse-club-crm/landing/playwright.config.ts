import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5184', channel: process.platform === 'win32' ? 'msedge' : 'chromium', screenshot: 'only-on-failure' },
  webServer: process.env.LANDING_TEST_EXTERNAL_SERVER ? undefined : { command: 'node test-server.mjs', url: 'http://127.0.0.1:5184', reuseExistingServer: false },
})
