import { test, expect } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
for (const width of [390, 1440]) test(`staff access and specialization persist at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  let row = { id, userId: id, fullName: 'Анна Иванова', roleTitle: 'Тренер', isActive: true, shifts: [],
    user: { role: 'TRAINER', email: 'trainer@example.com', vkId: null, trainerId: id, crmAccess: true,
      trainer: { commissionPercent: 30, allowIndividual: true, allowGroup: false, allowWalk: true, allowSpecial: true } } }
  let patches = 0
  let fail = true
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [row], total: 1 } }))
  await page.route(`**/api/staff/${id}`, route => {
    patches++
    if (fail) { fail = false; return route.fulfill({ status: 409, json: { message: 'Повторите сохранение' } }) }
    const body = route.request().postDataJSON() as { createCrmAccess?: boolean; allowWalk?: boolean; allowGroup?: boolean }
    row = { ...row, user: { ...row.user, crmAccess: body.createCrmAccess ?? row.user.crmAccess,
      trainer: { ...row.user.trainer, allowWalk: body.allowWalk ?? row.user.trainer.allowWalk, allowGroup: body.allowGroup ?? row.user.trainer.allowGroup } } }
    return route.fulfill({ json: row })
  })
  await page.goto('/staff?tab=employees')
  const toggle = page.getByRole('switch', { name: 'Доступ в CRM: Анна Иванова', exact: true })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  expect(patches).toBe(0)
  await toggle.click()
  await page.getByRole('button', { name: 'Отключить доступ', exact: true }).click()
  await expect(page.getByText('Повторите сохранение', { exact: true })).toBeVisible()
  await expect(toggle).toBeChecked()
  await toggle.click()
  await page.getByRole('button', { name: 'Отключить доступ', exact: true }).click()
  await expect(toggle).not.toBeChecked()
  await toggle.focus(); await toggle.press('Space')
  await expect(toggle).toBeChecked()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Редактирование сотрудника: Анна Иванова', exact: true })
  const walk = drawer.getByRole('switch', { name: 'Прогулки и выезды', exact: true })
  await expect(walk).toBeChecked()
  await expect(drawer.getByRole('switch', { name: 'Групповые занятия', exact: true })).not.toBeChecked()
  await walk.focus(); await walk.press('Space')
  const access = drawer.getByRole('switch', { name: 'Доступ в CRM', exact: true })
  await access.click()
  await page.getByRole('button', { name: 'Отключить доступ', exact: true }).click()
  await expect(access).not.toBeChecked()
  await expect(toggle).toBeChecked()
  await walk.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath(`staff-toggles-${width}.png`), animations: 'disabled' })
  expect(await drawer.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(toggle).not.toBeChecked()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await expect(walk).not.toBeChecked()
  await expect(page.getByRole('dialog').getByRole('switch', { name: 'Доступ в CRM', exact: true })).not.toBeChecked()
})

test('own CRM access is disabled in list and form', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  const row = { id, userId: id, fullName: 'Администратор', roleTitle: 'Администратор', isActive: true,
    user: { role: 'ADMIN', email: 'qa@example.com', crmAccess: true } }
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [row], total: 1 } }))
  await page.goto('/staff?tab=employees')
  await expect(page.getByRole('switch', { name: 'Доступ в CRM: Администратор', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('switch', { name: 'Доступ в CRM', exact: true })).toBeDisabled()
})

test('lesson drawer warns about trainer specialization and still permits saving', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  const trainer = { id, name: 'Анна Иванова', fullName: 'Анна Иванова', isActive: true, allowWalk: false }
  const client = { id, name: 'Мария', firstName: 'Мария', lastName: '', memberships: [] }
  const service = { id, name: 'Прогулка', title: 'Прогулка', durationMinutes: 60, maxCapacity: 1, price: 2000, serviceDirection: 'allowWalk' }
  for (const [resource, rows] of Object.entries({ trainers: [trainer], clients: [client], services: [service], horses: [], arenas: [], lessons: [], bookings: [] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  }
  await page.route(`**/api/clients/${id}`, route => route.fulfill({ json: client }))
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } }))
  let saved = false
  await page.route('**/api/lessons', route => { saved = true; return route.fulfill({ status: 201, json: { id } }) })
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  for (const [field, label] of [['Клиент', 'Мария'], ['Услуга', 'Прогулка'], ['Тренер', 'Анна Иванова']]) {
    const select = drawer.getByRole('combobox', { name: field, exact: true })
    await select.fill(label)
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: label }).first().click()
  }
  await expect(drawer.getByRole('status').filter({ hasText: 'не входит в специализацию тренера' })).toBeVisible()
  const save = drawer.getByRole('button', { name: 'Записать на тренировку', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(drawer).toBeHidden()
  expect(saved).toBe(true)
})
