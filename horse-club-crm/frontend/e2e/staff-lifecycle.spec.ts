import { test, expect, type Page } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
async function setup(page: Page, readOnly = false) {
  await page.addInitScript(readOnly => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', readOnly ? 'MANAGER' : 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  }, readOnly)
  if (readOnly) await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: 'READ_ONLY' })) } }))
  await page.route('**/api/staff/candidates', route => route.fulfill({ json: [] }))
  let onDuty = false, fail = true
  let rows: Record<string, unknown>[] = []
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const resource of ['clients', 'horses', 'arenas', 'services', 'lessons', 'bookings']) await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/trainers?*', route => route.fulfill({ json: rows.filter(row => row.isActive).map(row => ({ id, name: row.fullName, fullName: row.fullName, isActive: true })), headers: { 'x-total-count': String(rows.length) } }))
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: rows.map(row => ({ ...row, shifts: onDuty ? [{ id }] : [] })), total: rows.length } }))
  await page.route('**/api/staff', route => {
    const body = route.request().postDataJSON()
    expect(body).toMatchObject({ fullName: 'Анна Иванова', role: 'TRAINER', createCrmAccess: false })
    expect(body.userId).toBeUndefined()
    if (fail) { fail = false; return route.fulfill({ status: 409, json: { message: 'Этот телефон уже используется' } }) }
    rows = [{ ...body, id, userId: id, isActive: true, user: { role: 'TRAINER', vkId: '12345', trainerId: id, crmAccess: false } }]
    return route.fulfill({ status: 201, json: rows[0] })
  })
  await page.route('**/api/shifts/start', route => { onDuty = true; return route.fulfill({ json: { id } }) })
  await page.route('**/api/shifts/end', route => { onDuty = false; return route.fulfill({ json: { id } }) })
  await page.route(`**/api/staff/${id}/archive`, route => { rows = rows.map(row => ({ ...row, isActive: false })); return route.fulfill({ json: rows[0] }) })
  return { seed: () => { rows = [{ id, userId: id, fullName: 'Анна Иванова', roleTitle: 'Тренер', isActive: true, user: { role: 'TRAINER', vkId: '12345' } }] } }
}

for (const width of [1440, 390]) test(`staff lifecycle drawer, errors, shifts and archive at ${width}px`, async ({ page }, info) => {
  await setup(page)
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/staff')
  await expect(page.getByText('Сотрудников пока нет.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '+ Добавить сотрудника', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Добавить сотрудника', exact: true })
  await drawer.getByRole('textbox', { name: 'ФИО', exact: true }).fill('Анна Иванова')
  await drawer.getByRole('textbox', { name: 'Должность', exact: true }).fill('Тренер')
  await drawer.getByRole('combobox', { name: 'Роль', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Тренер', { exact: true }).click()
  await page.screenshot({ path: info.outputPath(`staff-drawer-${width}.png`), fullPage: true })
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer.getByText('Этот телефон уже используется')).toBeVisible()
  await expect(drawer.getByRole('textbox', { name: 'ФИО', exact: true })).toHaveValue('Анна Иванова')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByText('Анна Иванова', { exact: true }).first()).toBeVisible()
  await page.goto('/schedule')
  await page.getByRole('combobox', { name: 'Фильтр по тренеру', exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Анна Иванова', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await page.getByRole('dialog').getByRole('combobox', { name: 'Тренер', exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Анна Иванова', { exact: true })).toBeVisible()
  await page.goto('/staff')
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click()
  await expect(page.getByText('На смене', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Закончить смену', exact: true }).click()
  await expect(page.getByText('Выходной', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Архивировать', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Архивировать', exact: true }).click()
  await expect(page.getByText('В архиве', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.screenshot({ path: info.outputPath(`staff-list-${width}.png`), fullPage: true })
})

test('staff read-only hides mutations and preserves filters', async ({ page }) => {
  const state = await setup(page, true); state.seed()
  await page.goto('/staff?role=TRAINER&activity=active')
  await expect(page.getByText('Анна Иванова', { exact: true }).first()).toBeVisible()
  for (const name of ['+ Добавить сотрудника', 'Редактировать', 'Начать смену', 'Архивировать']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/role=TRAINER/)
})
