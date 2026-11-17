import { test as base } from '@playwright/test'
export { expect } from '@playwright/test'
export type { Page, Locator } from '@playwright/test'
// Legacy feature specs isolate their own role policy. The module matrix is fully
// enabled there; module-access.spec.ts exercises the real matrix combinations.
export const test = base.extend<{ modulePolicy: void }>({
  modulePolicy: [async ({ page }, use) => {
    page.on('pageerror', error => console.error(`[browser] ${error.stack ?? error.message}`))
    await page.route('**/api/leads/events', route => route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' }))
    await page.route('**/api/workspace/trainer-board?*', route => route.fulfill({ json: {
      date: new URL(route.request().url()).searchParams.get('date'), timeZone: 'Europe/Moscow',
      trainerId: '00000000-0000-4000-8000-000000000998', trainers: [], lessons: [], horses: [], openTime: '09:00', closeTime: '21:00',
    } }))
    await page.route('**/api/cashbox/summary', route => route.fulfill({ json: { mainBalance: 0, boardingBalance: 0, mainOperationsCount: 0, boardingOperationsCount: 0 } }))
    await page.route('**/api/settings/access/me*', async route => {
      const role = await page.evaluate(() => localStorage.getItem('horsecrm.role')).catch(() => null)
      if (!role) return route.abort('aborted')
      await route.fulfill({ json: { role, userId: '00000000-0000-4000-8000-000000000999', trainerId: null, permissions: {
        horseReplaceOwn: false, horseReplaceAny: false, healthRead: true, healthWrite: false, financeRead: false, boardingAccess: true,
      } } })
    })
    await page.route('**/api/settings/my-permissions*', async route => {
      const role = await page.evaluate(() => localStorage.getItem('horsecrm.role')).catch(() => null)
      if (!role) return route.abort('aborted')
      await route.fulfill({ json: { role, modules: ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL']
        .map(module => ({ module, isEnabled: true, accessLevel: 'FULL' })) } })
    })
    await use()
  }, { auto: true }],
})
