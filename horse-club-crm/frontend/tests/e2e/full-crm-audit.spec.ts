import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Page, Locator, TestInfo } from '@playwright/test'
import { test, expect, client, service, employee, horse, trainer, uuid } from './audit-fixture'

const screens = [
  ['/dashboard', 'Хорошей смены!'], ['/schedule', 'Расписание'], ['/clients', 'Клиенты'],
  ['/memberships', 'Абонементы'], ['/horses', 'Лошади'], ['/stalls', 'Денники'],
  ['/boarding', 'Договоры постоя'], ['/vet', 'Ветеринарный журнал'], ['/services', 'Услуги'],
  ['/staff', 'Персонал'], ['/shifts', 'Персонал'], ['/finance', 'Финансовые отчёты'],
  ['/settings', 'Режим работы'], ['/leads', 'Заявки'], ['/stable', 'Карта денников'],
] as const

async function settled(page: Page) {
  await expect(page.locator('.ant-spin-spinning, .ant-skeleton')).toHaveCount(0)
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))) })
}

async function capture(page: Page, info: TestInfo, name: string) {
  const directory = resolve('../docs/test-reports/full-crm-audit-2026-11-26', info.project.name)
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, `${name}.png`)
  await page.screenshot({ path, animations: 'disabled' })
  await info.attach(name, { path, contentType: 'image/png' })
}

async function geometry(page: Page) {
  const main = page.locator('.crm-main')
  await expect(main).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  const measure = () => main.evaluate(el => {
    const rect = el.getBoundingClientRect()
    return { x: rect.x, width: rect.width, height: rect.height, scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
  })
  const header = page.locator('.cashbox-header-widget')
  await expect(header).toBeVisible()
  const before = await measure(), headerBefore = await header.boundingBox()
  expect(headerBefore).not.toBeNull()
  for (const fraction of [0.5, 1, 0]) {
    await main.evaluate((el, fraction) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction }, fraction)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const current = await measure(), bounds = await header.boundingBox()
    expect(bounds).not.toBeNull()
    expect(Math.abs(current.x - before.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(current.width - before.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(current.height - before.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(current.scrollHeight - before.scrollHeight)).toBeLessThanOrEqual(1)
    expect(Math.abs((bounds?.x ?? Infinity) - (headerBefore?.x ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs((bounds?.y ?? Infinity) - (headerBefore?.y ?? 0))).toBeLessThanOrEqual(1)
    if (fraction === 1) expect(Math.abs(current.scrollTop - Math.max(0, current.scrollHeight - current.height))).toBeLessThanOrEqual(1)
    const obscured = await main.locator('button:visible, a:visible, input:visible').evaluateAll(elements => elements.flatMap(el => {
      // rc-table renders an aria-hidden zero-height header to measure columns.
      if (el.closest('[aria-hidden="true"]')) return []
      const r = el.getBoundingClientRect(), main = el.closest('.crm-main')?.getBoundingClientRect()
      if (!main || r.width === 0 || r.height === 0 || r.top < main.top || r.bottom > main.bottom || r.left < main.left || r.right > main.right) return []
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      const control = el.closest('.ant-select-selector, .ant-input-affix-wrapper') ?? el
      return top && (control.contains(top) || top.contains(control)) ? [] : [{ target: el.textContent || el.getAttribute('aria-label') || el.tagName, covering: top?.outerHTML.slice(0, 250) }]
    }))
    expect(obscured, 'Visible controls must remain reachable by pointer').toEqual([])
  }
  expect((await measure()).scrollTop).toBe(0)
}

for (const [path, title] of screens) test(`screen ${path}: geometry, scroll and runtime`, async ({ page }, info) => {
  await page.goto(path)
  await expect(page.locator('.crm-main')).toContainText(title)
  await expect(page.getByText('Страница не найдена', { exact: true })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', String(info.project.use.colorScheme))
  await settled(page)
  if (page.viewportSize()?.width === 390 && ['/memberships', '/stalls'].includes(path)) {
    await expect(page.locator('.responsive-record-list .ant-pagination')).toHaveCount(0)
  }
  await geometry(page)
  await capture(page, info, path.slice(1))
})

async function choose(page: Page, container: Locator, label: string, text: string) {
  const select = container.getByRole('combobox', { name: label, exact: true })
  await select.focus(); await select.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).first().click()
}

for (const method of ['CASH', 'CARD'] as const) test(`scenario 1: create client, sell membership ${method}, refresh header`, async ({ page, audit }, info) => {
  await page.goto('/clients/new')
  const create = page.locator('.crm-main')
  await create.getByRole('textbox', { name: 'Имя', exact: true }).fill('Аудит')
  await create.getByRole('textbox', { name: 'Фамилия', exact: true }).fill('Клиент')
  await create.getByRole('textbox', { name: 'Телефон', exact: true }).fill('+79991234567')
  await create.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page).toHaveURL(/\/clients$/)
  expect(audit.mutations[0]).toMatchObject({ path: 'clients', method: 'POST', body: { firstName: 'Аудит', lastName: 'Клиент' } })
  await page.goto(`/memberships/new?clientId=${client.id}`)
  const sale = page.getByRole('dialog', { name: 'Продажа абонемента', exact: true })
  await choose(page, sale, 'Услуга', service.title)
  await sale.getByRole('button', { name: '8 занятий', exact: true }).click()
  if (method === 'CARD') await sale.getByText('Безналичные', { exact: true }).click()
  const main = page.getByRole('link').filter({ hasText: 'Основная касса' }).first()
  const boarding = page.getByRole('link').filter({ hasText: 'Касса постоя' }).first()
  await expect(main).toContainText(/10\s000/)
  const boardingBefore = await boarding.textContent()
  await sale.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(sale).toBeHidden()
  expect(audit.mutations.at(-1)).toMatchObject({ path: 'memberships', body: { clientId: client.id, serviceId: service.id, totalLessons: 8, totalPrice: 12000, paymentMethod: method } })
  await expect(main).toContainText(/22\s000/)
  expect(await boarding.textContent()).toBe(boardingBefore)
  await capture(page, info, `scenario-1-${method}`)
})

test('scenario 4: seven working days, shift preview and protected own access', async ({ page, audit }, info) => {
  const weekDays = Array.from({ length: 7 }, (_, index) => ({ dayOfWeek: index + 1, isWorkingDay: true, openTime: '09:00', closeTime: '21:00' }))
  let savedDays = weekDays
  await page.route('**/api/settings/club-schedule', route => {
    if (route.request().method() === 'PATCH') savedDays = (route.request().postDataJSON() as { weekDays: typeof weekDays }).weekDays
    return route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [], weekDays: savedDays } })
  })
  await page.goto('/settings')
  for (let day = 1; day <= 7; day++) await expect(page.getByTestId(`schedule-day-${day}`).getByRole('switch')).toBeChecked()
  await page.getByTestId('schedule-day-7').getByRole('switch').click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('График работы сохранён', { exact: true })).toBeVisible()
  expect(savedDays).toHaveLength(7)
  expect(savedDays[6].isWorkingDay).toBe(false)
  let plannedDays: { date: string; kind: string }[] = []
  await page.route('**/api/staff/shifts', route => {
    const body = route.request().postDataJSON() as { staffId: string; days: typeof plannedDays }
    expect(body.staffId).toBe(employee.id)
    plannedDays = body.days
    return route.fulfill({ json: { count: plannedDays.length } })
  })
  await page.goto('/shifts')
  await page.getByRole('button', { name: 'Применить шаблон', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Применить шаблон', exact: true })
  await choose(page, drawer, 'Шаблон недели', '2 через 2')
  await expect(drawer.getByLabel('Предпросмотр недели')).toBeVisible()
  await expect(drawer.getByLabel('Предпросмотр недели').getByRole('listitem')).toHaveCount(7)
  await capture(page, info, 'scenario-4-shift-preview')
  expect(audit.mutations).toHaveLength(0)
  expect(plannedDays).toHaveLength(0)
  await drawer.getByRole('button', { name: 'Применить к неделе', exact: true }).click()
  await expect(drawer).toBeHidden()
  expect(plannedDays).toHaveLength(7)
  expect(plannedDays.some(day => day.kind === 'WORK')).toBe(true)
  await page.goto('/staff?tab=employees')
  await expect(page.getByRole('switch', { name: `Доступ в CRM: ${employee.fullName}`, exact: true })).toBeDisabled()
  let crmAccess = true
  const other = { ...employee, id: uuid(50), userId: uuid(51), fullName: 'Аудит Сотрудник', user: { ...employee.user, email: 'other@example.local', role: 'TRAINER' } }
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [{ ...other, user: { ...other.user, crmAccess } }], total: 1 } }))
  await page.route(`**/api/staff/${other.id}`, route => {
    crmAccess = (route.request().postDataJSON() as { createCrmAccess: boolean }).createCrmAccess
    return route.fulfill({ json: { ...other, user: { ...other.user, crmAccess } } })
  })
  await page.reload()
  const toggle = page.getByRole('switch', { name: `Доступ в CRM: ${other.fullName}`, exact: true })
  await toggle.click()
  await page.getByRole('button', { name: 'Отключить доступ', exact: true }).click()
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
})

test('scenario 5: finance KPI propagates journal filters', async ({ page }) => {
  for (const [name, method, source] of [['Наличные', 'CASH', null], ['Безналичные', 'BANK', null], ['Продажи абонементов', null, 'MEMBERSHIP']] as const) {
    await page.goto('/finance')
    const request = page.waitForRequest(request => new URL(request.url()).pathname === '/api/finance/journal')
    await page.getByRole('link', { name: `${name}: открыть журнал`, exact: true }).click()
    await expect(page.locator('#cash-journal')).toBeVisible()
    await expect(page).toHaveURL(url => url.pathname === '/cash-desk' && url.searchParams.get('operation') === 'INCOME' && url.searchParams.get('method') === method)
    const url = new URL(page.url())
    expect(url.searchParams.get('method')).toBe(method)
    expect(url.searchParams.get('source')).toBe(source)
    expect(url.searchParams.get('operation')).toBe('INCOME')
    const query = new URL((await request).url()).searchParams
    expect(query.get('paymentMethod')).toBe(method)
    expect(query.get('source')).toBe(source)
    expect(query.get('operationType')).toBe('INCOME')
  }
})

test('directory: populated desktop table/mobile cards, pagination and real scrolling', async ({ page }, info) => {
  const rows = Array.from({ length: 31 }, (_, index) => ({ ...client, id: uuid(100 + index), firstName: `Клиент ${index + 1}`, name: `Клиент ${index + 1} Клиент` }))
  const offsets: number[] = []
  await page.route('**/api/clients?*', route => {
    const params = new URL(route.request().url()).searchParams
    const offset = Number(params.get('_start') ?? 0), limit = Number(params.get('_end') ?? 10) - offset
    offsets.push(offset)
    return route.fulfill({ json: rows.slice(offset, offset + limit), headers: { 'x-total-count': '31' } })
  })
  await page.goto('/clients')
  await expect(page.getByRole('button', { name: rows[0].name, exact: true })).toBeVisible()
  if (page.viewportSize()?.width === 390) {
    await expect(page.locator('.responsive-record-item').first()).toBeVisible()
  } else await expect(page.getByRole('columnheader', { name: 'Клиент', exact: true })).toBeVisible()
  await settled(page)
  await geometry(page)
  await capture(page, info, 'clients-populated')
  const next = page.locator('.ant-pagination-next')
  for (let pageNumber = 2; pageNumber <= 4; pageNumber++) {
    await next.click()
    await expect.poll(() => offsets.at(-1)).toBe((pageNumber - 1) * 10)
    await settled(page)
  }
  await expect(next).toHaveClass(/ant-pagination-disabled/)
  await expect(page.getByRole('button', { name: rows[0].name, exact: true })).toHaveCount(0)
  await page.locator('.ant-pagination-prev').click()
  await expect.poll(() => offsets.at(-1)).toBe(20)
})

test('scenario 2: create lesson with soft direction warnings and debit membership', async ({ page, audit }, info) => {
  let remaining = 8
  const membership = () => ({ id: uuid(6), totalLessons: 8, remainedLessons: remaining, isActive: true, validUntil: '2027-12-31', createdAt: '2026-11-01', pricingPlan: { id: uuid(7), name: 'Аудит 8 занятий' }, payments: [], operations: [], members: [] })
  let lesson: Record<string, unknown> | undefined
  await page.route(`**/api/clients/${client.id}`, route => route.fulfill({ json: { ...client, memberships: [membership()] } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: lesson ? [lesson] : [] }))
  await page.route('**/api/lessons', route => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({ clientId: client.id, trainerId: trainer.id, horseId: horse.id, serviceId: service.id, membershipId: uuid(6) })
    audit.mutations.push({ path: 'lessons', method: 'POST', body })
    lesson = { ...body, id: uuid(20), trainer, service, arena: null, status: 'SCHEDULED', cost: 1500,
      endTime: new Date(Date.parse(String(body.startTime)) + 3600000).toISOString(),
      bookings: [{ id: uuid(21), client, clientId: client.id, horse, horseId: horse.id, membership: membership(), membershipId: uuid(6), costAmount: 1500, payments: [] }] }
    return route.fulfill({ status: 201, json: lesson })
  })
  await page.route(`**/api/lessons/${uuid(20)}/complete`, route => {
    expect(route.request().method()).toBe('POST')
    remaining--
    lesson = { ...lesson, status: 'COMPLETED' }
    return route.fulfill({ json: lesson })
  })
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  for (const [label, value] of [['Клиент', client.name], ['Услуга', service.title], ['Тренер', trainer.name], ['Лошадь', horse.name]]) await choose(page, drawer, label, value)
  await expect(drawer.getByRole('status').filter({ hasText: 'не входит в специализацию тренера' })).toBeVisible()
  await expect(drawer.getByRole('status').filter({ hasText: 'лошади' })).toBeVisible()
  await drawer.getByRole('checkbox', { name: 'Списать занятие с абонемента' }).check()
  await capture(page, info, 'scenario-2-warnings')
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).toBeHidden()
  await page.locator('.fc-event').first().click()
  await page.getByRole('button', { name: 'Отметить присутствие', exact: true }).click()
  await page.getByRole('button', { name: 'Завершить занятие', exact: true }).click()
  await expect.poll(() => remaining).toBe(7)
  await page.goto('/clients')
  await page.getByRole('button', { name: client.name, exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка клиента' })).toContainText('7 / 8')
})

test('scenario 3: horse directions, stall map and isolated boarding receipt', async ({ page, audit }, info) => {
  await page.goto('/horses')
  await page.getByRole('button', { name: horse.name, exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка лошади', exact: true })
  await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Редактирование лошади', exact: true })
  for (const [label, checked] of [['Индивидуальные тренировки', true], ['Групповые занятия', false], ['Прогулки и выезды', false], ['Иппотерапия и фотосессии', true]] as const) {
    await expect(editor.getByRole('switch', { name: label, exact: true })).toBeChecked({ checked })
  }
  const buildingId = uuid(60)
  await page.route('**/api/stable-buildings', route => route.fulfill({ json: [{ id: buildingId, name: 'Аудит Конюшня', order: 0, gridRows: 2, gridCols: 3, aisleCols: [2], total: 1, occupied: 1, available: 0, roomCount: 1 }] }))
  await page.route('**/api/stalls/map', route => route.fulfill({ json: [{ id: uuid(61), name: 'Денник аудита', number: '1', zone: 'MAIN', side: 'LEFT', position: 1, status: 'OCCUPIED', horseId: horse.id, horse: { ...horse, sex: 'GELDING', feedingNotes: null }, notes: null, warnings: [], buildingId, row: 1, col: 1, rowSpan: 1, colSpan: 1, type: 'STALL' }] }))
  await page.goto('/stable')
  await expect(page.locator('.crm-main')).toContainText('Карта денников')
  await expect(page.locator('.crm-main')).toContainText(horse.name)
  await settled(page)
  await geometry(page)
  await capture(page, info, 'scenario-3-stall-map')
  const contract = { id: uuid(30), clientId: client.id, client, horse, status: 'ACTIVE', monthlyRate: 25000, startsAt: '2026-11-01', endsAt: null, payments: [], stall: null }
  await page.route('**/api/boarding-contracts?*', route => route.fulfill({ json: [contract], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/boarding-contracts/${contract.id}`, route => route.fulfill({ json: contract }))
  await page.route('**/api/payments/boarding-options', route => route.fulfill({ json: [contract] }))
  await page.route('**/api/payments', route => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({ boardingContractId: contract.id, amount: 25000, status: 'PAID', method: 'CASH' })
    audit.boarding += Number(body.amount)
    return route.fulfill({ status: 201, json: { id: uuid(31), ...body } })
  })
  await page.goto('/boarding')
  await page.getByRole('button', { name: client.name, exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка договора постоя' })).toContainText(horse.name)
  await page.goto('/boarding')
  const mainBefore = audit.main
  await page.getByRole('button', { name: '+ Приход', exact: true }).click()
  const receipt = page.getByRole('dialog', { name: 'Приход постоя', exact: true })
  const select = receipt.getByLabel('Договор / владелец')
  await select.click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: horse.name }).click()
  await receipt.getByLabel('Сумма, ₽').fill('25000')
  await receipt.getByRole('button', { name: 'Провести', exact: true }).click()
  await expect(receipt).toBeHidden()
  await expect(page.locator('.cashbox-header-link').filter({ hasText: 'Касса постоя' })).toContainText(/28\s000/)
  expect(audit.main).toBe(mainBefore)
  await capture(page, info, 'scenario-3-boarding')
})

test.describe('TRAINER role', () => {
  test.use({ auditRole: 'TRAINER' })
  test('administrative routes stay inaccessible, schedule attendance works', async ({ page, audit }) => {
    let status = 'SCHEDULED'
    await page.route('**/api/workspace/trainer-board?*', route => route.fulfill({ json: {
      date: '2026-11-26', timeZone: 'Europe/Moscow', trainerId: trainer.id, trainers: [trainer], horses: [], openTime: '09:00', closeTime: '21:00',
      lessons: [{ id: uuid(40), trainerId: trainer.id, trainer, startTime: '2026-11-26T06:00:00Z', endTime: '2026-11-26T07:00:00Z', status, arena: null, isOwn: true, trainerNote: null, bookings: [{ id: uuid(41), horse, client, clientConfirmed: true }] }],
    } }))
    await page.route(`**/api/lessons/${uuid(40)}/trainer-status`, route => {
      const body = route.request().postDataJSON() as { status: string }
      expect(body.status).toBe('COMPLETED'); status = body.status
      return route.fulfill({ json: { status } })
    })
    for (const path of ['/settings', '/staff', '/shifts', '/finance', '/cash-desk', '/boarding', '/leads']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/trainer$/)
      await expect(page.locator('.cashbox-header-widget')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Принять платёж', exact: true })).toHaveCount(0)
    }
    await page.goto('/schedule')
    await expect(page).toHaveURL(/\/trainer$/)
    await page.getByRole('button', { name: 'Проведено', exact: true }).click()
    await expect(page.locator('.board-lesson-own')).toContainText('Проведено')
    await expect(page.getByRole('button', { name: 'Проведено', exact: true })).toHaveCount(0)
    expect(audit.mutations).toHaveLength(0)
  })
})
