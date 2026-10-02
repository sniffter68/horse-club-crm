import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5184', channel: 'msedge', screenshot: 'only-on-failure' },
  webServer: { command: 'npm.cmd run dev:test -- --port 5184', url: 'http://127.0.0.1:5184', reuseExistingServer: false },
})
