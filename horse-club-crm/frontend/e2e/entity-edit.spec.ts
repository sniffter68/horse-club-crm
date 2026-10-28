import { test, expect, type Page } from './fixtures'

for (const width of [320, 390, 1440]) {
  for (const resource of ['clients', 'horses'] as const) test(`${resource}: grouped profile stays readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await login(page)
    const client = resource === 'clients'
    const name = client ? 'Александр Кузнецов' : 'Амур'
    const row = { id, name, firstName: 'Александр', lastName: 'Кузнецов', isRider: true, isPayer: true,
      phone: '+79991234567', email: 'alexander.kuznetsov@example.com', birthDate: '1990-05-15',
      clientType: 'REGULAR', createdAt: '2026-10-01', membership: null, riderLevel: 'Начинающий',
      preferences: 'Важный комментарий\nВторая строка', medicalNotes: 'Нет противопоказаний',
      breed: 'Ахалтекинская', coat: 'Гнедой', birthYear: 2015, ownerType: 'private', status: 'rest', isUnavailable: true,
      maxDailyMinutes: 240, minRestMinutes: 15, memberships: [], boardingContracts: [], bookings: [], payments: [], healthLogs: [],
    }
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [row], headers: { 'x-total-count': '1' } }))
    await page.route(`**/api/${resource}/${id}`, route => route.fulfill({ json: row }))
    await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
    await page.goto(`/${resource}`)
    await page.getByRole('button', { name, exact: true }).click()
    const card = page.getByRole('dialog', { name: client ? 'Карточка клиента' : 'Карточка лошади', exact: true })
    await expect(card).toHaveCSS('transform', 'none')
    await expect(card.getByRole('heading', { name, exact: true })).toBeVisible()
    await card.getByRole('heading', { name, exact: true }).scrollIntoViewIfNeeded()
    await expect(card).not.toHaveClass(/ant-zoom-(appear|enter)/)
    await expect(card.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible()
    await expect(card.locator('.profile-fields')).toHaveCount(client ? 3 : 2)
    await expect(card.locator('.ant-descriptions-bordered')).toHaveCount(0)
    if (client) {
      await expect(card.getByRole('link', { name: row.phone })).toHaveAttribute('href', `tel:${row.phone}`)
      await expect(card.getByRole('link', { name: row.email })).toHaveAttribute('href', `mailto:${row.email}`)
      await expect(card.getByText('Не назначена', { exact: true })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Удалить', exact: true })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Привязать VK', exact: true })).toBeVisible()
    } else {
      await expect(card.getByText('Ахалтекинская', { exact: true })).toBeVisible()
      await expect(card.getByText('Гнедой', { exact: true })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Сменить статус', exact: true })).toBeVisible()
      await card.getByRole('heading', { name: 'Предстоящие занятия и расписание', exact: true }).scrollIntoViewIfNeeded()
      await expect(card.getByText('Предстоящих занятий нет', { exact: true })).toBeVisible()
    }
    const geometry = await card.evaluate(el => {
      const content = el.querySelector('.ant-modal-content')!
      const body = el.querySelector('.ant-modal-body')!
      const box = content.getBoundingClientRect()
      return { left: box.left, right: box.right, bottom: box.bottom,
        overflow: body.scrollWidth - body.clientWidth,
        fields: [...el.querySelectorAll('.profile-fields dd')].map(value => ({
          width: value.clientWidth, overflow: value.scrollWidth - value.clientWidth,
          wordBreak: getComputedStyle(value).wordBreak, hyphens: getComputedStyle(value).hyphens,
        })) }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(width)
    expect(geometry.bottom).toBeLessThanOrEqual(900)
    expect(geometry.overflow).toBeLessThanOrEqual(1)
    for (const field of geometry.fields) {
      expect(field.width).toBeGreaterThan(180)
      expect(field.overflow).toBeLessThanOrEqual(1)
      expect(field.wordBreak).toBe('normal')
      expect(field.hyphens).toBe('none')
    }
    await card.locator('.ant-modal-body').evaluate(el => { el.scrollTop = 0 })
    await page.screenshot({ path: testInfo.outputPath(`profile-${resource}-${width}.png`) })
    await card.getByRole('button', { name: 'Редактировать', exact: true }).focus()
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
  })
}

const id = '00000000-0000-4000-8000-000000000091'
async function login(page: Page, readOnly = false) {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'MANAGER')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules:
    ['SCHEDULE', 'STABLES', 'STAFF_PAYROLL', 'CASHBOX', 'VETERINARY'].map(module => ({ module, isEnabled: true, accessLevel: readOnly ? 'READ_ONLY' : 'FULL' })) } }))
}

for (const resource of ['clients', 'horses', 'trainers'] as const) {
  for (const width of [1440, 390]) test(`${resource}: edit drawer, failed save and live refresh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await login(page)
    if (resource === 'clients') {
      for (const catalog of ['trainers', 'horses']) await page.route(`**/api/${catalog}?*`, route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
    }
    const cardTitle = { clients: 'Карточка клиента', horses: 'Карточка лошади', trainers: 'Карточка тренера' }[resource]
    let record: Record<string, unknown> = {
      id, name: 'Тестовая запись', firstName: 'Тестовая', lastName: 'запись', phone: '+79991234567', email: 'qa@example.com',
      clientType: 'REGULAR', isRider: true, isPayer: false, createdAt: '2026-10-01', membership: null,
      maxRiderWeight: 85, maxDailyMinutes: 120, minRestMinutes: 45, isUnavailable: false, status: 'active', ownerType: 'club',
      maxDailyLoad: 480, baseRate: 1500, isPublic: false, order: 0,
      memberships: [], bookings: [], payments: [], boardingContracts: [], healthLogs: [],
    }
    let fail = true
    let payload: Record<string, unknown> | undefined
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [record], headers: { 'x-total-count': '1' } }))
    await page.route(`**/api/${resource}/${id}`, route => {
      if (route.request().method() === 'PATCH') {
        payload = route.request().postDataJSON()
        if (fail) return route.fulfill({ status: 409, json: { message: 'Запись изменилась. Повторите сохранение' } })
        record = { ...record, ...payload }
      }
      return route.fulfill({ json: record })
    })
    await page.route('**/api/horse-issues*', route => route.fulfill({ json: [] }))
    await page.goto(`/${resource}`)
    await page.getByRole('button', { name: 'Тестовая запись', exact: true }).click()
    const card = page.getByRole('dialog', { name: cardTitle, exact: true })
    await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: /Редактирование/ })
    const label = { clients: 'Имя', horses: 'Кличка', trainers: 'ФИО' }[resource]
    await drawer.getByLabel(label, { exact: true }).fill('Обновленная')
    if (resource === 'clients') {
      await drawer.getByLabel('Уровень опыта', { exact: true }).fill('Начинающий')
      await drawer.getByLabel('Дата рождения', { exact: true }).fill('15.05.1990')
      await drawer.getByLabel('Дата рождения', { exact: true }).press('Enter')
    }
    if (resource === 'horses') {
      await drawer.getByLabel('Масть', { exact: true }).fill('Гнедая')
      await drawer.getByRole('combobox', { name: 'Статус', exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').click()
      await page.getByTitle('Отдых', { exact: true }).click()
    }
    if (resource === 'trainers') await drawer.getByLabel('Цвет в расписании', { exact: true }).fill('#724C39')
    await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(drawer.getByRole('alert')).toContainText('Запись изменилась')
    await expect(drawer.getByLabel(label, { exact: true })).toHaveValue('Обновленная')
    fail = false
    await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(drawer).toBeHidden()
    await expect(card).toContainText('Обновленная')
    expect(payload?.name).toBe(resource === 'clients' ? 'Обновленная запись' : 'Обновленная')
    if (resource === 'clients') expect(payload?.birthDate).toBe('1990-05-15')
    if (resource === 'horses') { expect(payload?.status).toBe('rest'); expect(payload?.isUnavailable).toBe(true) }
    await card.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('button', { name: resource === 'clients' ? 'Обновленная запись' : 'Обновленная', exact: true })).toBeVisible()
  })
}

for (const resource of ['clients', 'horses', 'trainers']) test(`read-only ${resource} card does not expose editing`, async ({ page }) => {
  await login(page, true)
  await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [{ id, name: 'Клиент', createdAt: '2026-10-01' }], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/${resource}/${id}`, route => route.fulfill({ json: { id, name: 'Клиент', memberships: [], boardingContracts: [], bookings: [], payments: [], healthLogs: [] } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto(`/${resource}`)
  await page.getByRole('button', { name: 'Клиент', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
})

for (const width of [1440, 390]) test(`staff profile edits update the list at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await login(page)
  let record = { id, userId: id, fullName: 'Сотрудник', roleTitle: 'Тренер', phone: '+79991234567', scheduleColor: '#724C39', shiftRate: '1000', lessonRate: null, groupLessonRate: null, lessonPercentage: null, isActive: true }
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [record], total: 1 } }))
  await page.route(`**/api/staff/${id}`, route => {
    expect(route.request().method()).toBe('PATCH')
    record = { ...record, ...route.request().postDataJSON() }
    return route.fulfill({ json: record })
  })
  await page.goto('/staff?tab=rates')
  await page.getByRole('button', { name: /Редактировать/, exact: false }).click()
  const drawer = page.getByRole('dialog', { name: /Редактирование сотрудника/ })
  await drawer.getByLabel('ФИО', { exact: true }).fill('Новый сотрудник')
  await drawer.getByLabel('Телефон', { exact: true }).fill('+79995554433')
  await drawer.getByLabel('Цвет в расписании', { exact: true }).fill('#336699')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByText('Новый сотрудник', { exact: true })).toBeVisible()
  expect(record.phone).toBe('+79995554433')
  expect(record.scheduleColor).toBe('#336699')
})

for (const width of [1024, 1440, 1920]) test(`sidebar remains stationary at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 600 })
  await login(page)
  await page.route('**/api/clients?*', route => route.fulfill({ json: Array.from({ length: 10 }, (_, i) => ({ id: `${id}${i}`, name: `Клиент ${i}`, createdAt: '2026-10-01', preferences: 'Длинная заметка '.repeat(25) })), headers: { 'x-total-count': '10' } }))
  await page.goto('/clients')
  await expect(page.getByRole('button', { name: 'Клиент 0', exact: true })).toBeVisible()
  const sidebar = page.locator('.crm-sidebar')
  const before = await sidebar.boundingBox()
  await page.locator('main').evaluate(el => { el.scrollTop = el.scrollHeight })
  expect(await page.locator('main').evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await sidebar.boundingBox()).toEqual(before)
  expect(before?.y).toBe(0)
  expect(before?.height).toBe(600)
  await page.screenshot({ path: `test-results/sidebar-${width}.png` })
})
