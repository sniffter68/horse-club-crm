import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'full-crm-audit.spec.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 2,
  retries: 0,
  fullyParallel: true,
  outputDir: './test-results/full-crm-audit',
  reporter: [['list'], ['json', { outputFile: '../docs/test-reports/full-crm-audit-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'msedge',
    timezoneId: 'Europe/Moscow',
    locale: 'ru-RU',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [1440, 390].flatMap(width => (['light', 'dark'] as const).map(colorScheme => ({
    name: `${width}-${colorScheme}`,
    use: { viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme },
  }))),
})
