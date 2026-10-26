import { test, expect } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const statementId = '22222222-2222-4222-8222-222222222222'
for (const width of [1440, 390]) test(`paid days lock, admin reopens and edits at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'admin@test.local')
  })
  let paid = true, fail = true, reopenCount = 0
  const staff = { id, userId: id, fullName: 'Анна Иванова', roleTitle: 'Тренер', isActive: true }
  const statement = () => ({ id: statementId, staffId: id, staff, periodStart: '2026-10-10T00:00:00Z', periodEnd: '2026-10-15T00:00:00Z', createdAt: '2026-10-16T21:30:00Z', totalAmount: '1000', isPaid: paid })
  const shifts = [10, 15, 16].map(day => ({ id: `33333333-3333-4333-8333-${String(day).padStart(12, '0')}`, staffId: id, date: `2026-10-${day}T00:00:00Z`, startTime: '08:00', endTime: '20:00', status: 'SCHEDULED' }))
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [staff], total: 1 } }))
  await page.route('**/api/staff/shifts?*', route => route.fulfill({ json: { data: shifts, total: shifts.length } }))
  await page.route(`**/api/staff/${id}/paid-periods`, route => route.fulfill({ json: paid ? [statement()] : [] }))
  await page.route('**/api/payroll/calculations?*', route => route.fulfill({ json: { data: [statement()], total: 1 } }))
  await page.route(`**/api/payroll/calculations/${statementId}/reopen`, route => {
    reopenCount++
    if (fail) { fail = false; return route.fulfill({ status: 409, json: { message: 'Конфликт отмены. Повторите попытку' } }) }
    paid = false
    return route.fulfill({ json: statement() })
  })
  await page.route('**/api/staff/shifts/*', route => route.fulfill({ json: { ...shifts[0], ...route.request().postDataJSON() } }))
  await page.goto('/staff?tab=shifts&month=2026-10')
  if (width === 1440) {
    const cells = page.locator('.staff-day-locked')
    await expect(cells).toHaveCount(6)
    await expect(cells.first().getByRole('button').first()).toBeDisabled()
    await cells.first().getByLabel('Период закрыт ведомостью от 17.10.2026').focus()
    await expect(page.getByRole('tooltip')).toContainText('Период закрыт ведомостью от 17.10.2026')
    await expect(page.locator('.staff-grid tbody td').nth(15).getByRole('button').first()).toBeEnabled()
  } else {
    await expect(page.getByRole('button', { name: 'Изменить смену', exact: true }).first()).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Изменить смену', exact: true }).last()).toBeEnabled()
  }
  await page.screenshot({ path: info.outputPath(`paid-days-${width}.png`), fullPage: true })
  let created = false
  await page.route('**/api/staff/shifts', route => {
    expect(route.request().postDataJSON().dates.every((date: string) => date < '2026-10-10' || date > '2026-10-15')).toBe(true)
    created = true
    return route.fulfill({ json: { count: 1 } })
  })
  await page.getByRole('button', { name: 'Запланировать смену', exact: true }).click()
  const createDrawer = page.getByRole('dialog', { name: 'Запланировать смену', exact: true })
  await createDrawer.getByRole('button', { name: 'Запланировать смену', exact: true }).click()
  await expect(createDrawer).toBeHidden()
  expect(created).toBe(true)
  // URL navigation also covers the tab at narrow widths where Ant Design overflows tabs.
  await page.goto('/staff?tab=statements')
  await page.getByRole('button', { name: 'Отменить оплату', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Отменить оплату ведомости?' })
  await expect(dialog).toContainText('Связанный расход зарплаты будет отменён')
  await dialog.getByRole('button', { name: 'Отменить оплату', exact: true }).click()
  await expect(page.getByText('Конфликт отмены. Повторите попытку', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Отменить оплату', exact: true }).click()
  await expect(page.getByText('Черновик', { exact: true })).toBeVisible()
  expect(reopenCount).toBe(2)
  await page.goto('/staff?tab=shifts&month=2026-10')
  if (width === 1440) {
    await expect(page.locator('.staff-day-locked')).toHaveCount(0)
    await page.locator('.staff-grid tbody td').nth(9).getByRole('button').first().click()
  } else await page.getByRole('button', { name: 'Изменить смену', exact: true }).first().click()
  const drawer = page.getByRole('dialog', { name: 'Изменить смену', exact: true })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Сохранить смену', exact: true }).click()
  await expect(drawer).toBeHidden()
})
