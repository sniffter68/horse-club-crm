import { defineConfig } from '@playwright/test'
import crm from './playwright.crm.config'

export default defineConfig({
  ...crm,
  projects: [{ name: 'ui-audit', testMatch: '**/ui-audit-cleanup.spec.ts' }],
})
