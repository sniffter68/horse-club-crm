import { test as base } from '@playwright/test'
export { expect } from '@playwright/test'
export type { Page, Locator } from '@playwright/test'
// Legacy feature specs isolate their own role policy. The module matrix is fully
// enabled there; module-access.spec.ts exercises the real matrix combinations.
export const test = base.extend<{ modulePolicy: void }>({
  modulePolicy: [async ({ page }, use) => {
    await page.route('**/api/settings/access/me*', async route => {
      const role = await page.evaluate(() => localStorage.getItem('horsecrm.role'))
      await route.fulfill({ json: { role, userId: 'fixture-user', trainerId: null, permissions: {
        horseReplaceOwn: false, horseReplaceAny: false, healthRead: true, healthWrite: false, financeRead: false, boardingAccess: true,
      } } })
    })
    await page.route('**/api/settings/my-permissions*', async route => {
      const role = await page.evaluate(() => localStorage.getItem('horsecrm.role'))
      await route.fulfill({ json: { role, modules: ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL']
        .map(module => ({ module, isEnabled: true, accessLevel: 'FULL' })) } })
    })
    await use()
  }, { auto: true }],
})
