import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: ['operations-audit.spec.ts', 'clients-memberships.spec.ts', 'vet-log.spec.ts', 'vet-records.spec.ts'],
  workers: 1, timeout: 30000, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60000 },
})
