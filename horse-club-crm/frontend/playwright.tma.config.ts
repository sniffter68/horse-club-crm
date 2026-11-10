import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: '**/trainer-tma.spec.ts', workers: 1, timeout: 30000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'msedge', headless: true,
    viewport: { width: 375, height: 812 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
})
