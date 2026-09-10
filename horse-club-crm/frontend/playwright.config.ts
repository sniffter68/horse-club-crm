import { defineConfig } from '@playwright/test'
export default defineConfig({
  projects: [
    { name: 'live', testMatch: '**/*.live.spec.ts' },
    { name: 'mock', testMatch: '**/s3-01.spec.ts' },
  ],
  testDir: './e2e', workers: 1, timeout: 20000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
})
