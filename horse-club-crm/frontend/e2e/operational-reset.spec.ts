import { test, expect, type Page } from './fixtures'

async function setup(page: Page, role = 'ADMIN') {
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', role)
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  }, role)
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  await page.route('**/api/dashboard/summary', route => route.fulfill({ json: {
    generatedAt: '2026-10-28T08:00:00Z', workDay: { date: '2026-10-28', openAt: '2026-10-28T06:00:00Z', closeAt: '2026-10-28T18:00:00Z', timeZone: 'Europe/Moscow' },
    alerts: [], horseWorkloads: [], leadRequests: [], kpi: { lessonsTotal: 0, lessonsCompleted: 0, newLeads: 0, activeMemberships: 0 },
    todayLessons: { total: 0, completed: 0, cancelled: 0 }, cashboxSummary: { cash: '0', card: '0', revenueToday: '0', expensesToday: '0' },
    horsesStatus: { total: 1, healthy: 1, treatment: 0, quarantine: 0 }, activeShifts: 0, onDutyStaff: [], pendingVetAlerts: 0, upcomingLessons: [],
  } }))
}

for (const width of [1280, 375]) test(`operational reset confirmation, error, retry, busy and dashboard at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); await setup(page)
  const bodies: Record<string, unknown>[] = []
  let fail = true
  let release: (() => void) | undefined
  await page.route('**/api/admin/reset-operational-data', async route => {
    bodies.push(route.request().postDataJSON())
    if (fail) return route.fulfill({ status: 500, json: { message: 'Сброс отменён: ошибка аудита' } })
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: { success: true } })
  })
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Очистка тестовых данных' }).click()
  const trigger = page.getByRole('button', { name: 'Очистить тестовые данные кассы и занятий', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Очистить тестовые данные?' })
  await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
  const submit = dialog.getByRole('button', { name: 'Удалить все данные', exact: true })
  await expect(submit).toBeDisabled()
  await dialog.getByLabel('Контрольная фраза').fill('RESET_CASH')
  await expect(submit).toBeDisabled(); expect(bodies).toHaveLength(0)
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused(); await trigger.click()
  await dialog.getByLabel('Контрольная фраза').fill('RESET_ALL_OPERATIONAL_DATA')
  await submit.click(); await expect(dialog.getByRole('alert').filter({ hasText: 'Сброс отменён: ошибка аудита' })).toBeVisible()
  await expect(dialog.getByLabel('Контрольная фраза')).toHaveValue('RESET_ALL_OPERATIONAL_DATA')
  fail = false; await submit.click()
  await expect(dialog.getByRole('status')).toContainText('Удаление данных')
  await expect(submit).toBeDisabled(); await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1])
  expect(bodies[0].requestId).toMatch(/^[\da-f-]{36}$/)
  await page.screenshot({ path: info.outputPath(`reset-busy-${width}.png`), fullPage: true })
  release!()
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Тестовые данные кассы и занятий удалены. Учет обнулён', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Баланс кассы — открыть кассу' })).toContainText('0')
})

test('manager cannot see operational reset', async ({ page }) => {
  await setup(page, 'MANAGER'); await page.goto('/settings')
  await expect(page.getByRole('tab', { name: 'Режим работы' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Очистка тестовых данных' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Очистить тестовые данные кассы и занятий' })).toHaveCount(0)
})
