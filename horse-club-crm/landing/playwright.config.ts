import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'msedge', screenshot: 'only-on-failure' },
  webServer: { command: 'npm.cmd run dev', url: 'http://127.0.0.1:5174', reuseExistingServer: true },
})
