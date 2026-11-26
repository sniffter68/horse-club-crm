import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['mobile-shell.spec.ts', 'public-content.spec.ts', 'workspace.spec.ts'],
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host localhost', url: 'http://localhost:5173', reuseExistingServer: true },
})
