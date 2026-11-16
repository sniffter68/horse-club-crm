import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'workspace.spec.ts', workers: 1, timeout: 30000,
  reporter: [['list']],
  use: { baseURL: process.env.CRM_TEST_BASE_URL || 'http://127.0.0.1:5173', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
})
