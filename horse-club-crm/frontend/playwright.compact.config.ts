import { defineConfig } from '@playwright/test'
import crm from './playwright.crm.config'

export default defineConfig({
  ...crm,
  projects: [{ name: 'compact', testMatch: '**/compact-demo.spec.ts' }],
  webServer: { command: 'npm run dev -- --host localhost', url: 'http://localhost:5173', reuseExistingServer: true },
})
