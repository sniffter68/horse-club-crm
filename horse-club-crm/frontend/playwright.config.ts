import { defineConfig } from '@playwright/test'
export default defineConfig({
  projects: [
    { name: 'live', testMatch: '**/*.live.spec.ts' },
    { name: 'mock', testMatch: ['**/s3-01.spec.ts', '**/clients-memberships.spec.ts', '**/horse-workload.spec.ts', '**/horse-replacement.spec.ts', '**/vet-log.spec.ts', '**/role-access.spec.ts', '**/vk-link.spec.ts', '**/quick-boarding.spec.ts', '**/triad-booking.spec.ts', '**/cash-desk.spec.ts', '**/lead-conversion.spec.ts', '**/public-content.spec.ts'] },
  ],
  testDir: './e2e', workers: 1, timeout: 20000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.CRM_TEST_BASE_URL || 'http://localhost:5173', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
})
