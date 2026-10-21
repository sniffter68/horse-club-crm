import { test, expect, type Page, type Locator } from './fixtures'
import type { Lesson } from '../src/pages/schedule/types'

const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
const client = { id: id(1), name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567' }
const trainer = { id: id(2), name: 'Мария' }
const service = { id: id(3), title: 'Разовая тренировка', name: 'Разовая тренировка', price: '1500', durationMinutes: 60, maxCapacity: 1, allowMembership: false }

async function setup(page: Page, prepaid?: number, group = false) {
  const selectedService = group ? { ...service, title: 'Экскурсия', name: 'Экскурсия', isPerPerson: true, price: '500' } : service
  await page.clock.setFixedTime(new Date('2026-10-20T08:00:00Z'))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  const state = { lesson: undefined as Lesson | undefined, receipts: [] as { id: string; amount: number; method: string; description: string }[], posts: [] as Record<string, unknown>[], fail: false }
  const makeLesson = (amount: number): Lesson => ({ id: id(4), status: 'SCHEDULED', startTime: '2026-10-20T09:00:00Z', endTime: '2026-10-20T10:00:00Z',
    trainer, service, arena: null, cost: 1500, prepaymentAmount: amount, prepaymentMethod: 'CASH', finalPaymentAmount: 0,
    paymentStatus: amount === 1500 ? 'PAID' : amount ? 'PARTIALLY_PAID' : 'UNPAID', bookings: [{ id: id(5), client, horse: null, membership: null, costAmount: 1500,
      payments: amount ? [{ status: 'PAID', amount }] : [] }] })
  if (prepaid !== undefined) state.lesson = makeLesson(prepaid)
  for (const [resource, rows] of Object.entries({ clients: [client], trainers: [trainer], services: [selectedService], horses: [], arenas: [] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  }
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: state.lesson ? [state.lesson] : [] }))
  await page.route('**/api/lessons', async route => {
    const body = route.request().postDataJSON(); state.posts.push(body)
    state.lesson = { ...makeLesson(body.prepaymentAmount ?? 0), startTime: body.startTime, endTime: new Date(+new Date(body.startTime) + body.durationMinutes * 60000).toISOString() }
    state.lesson.service = selectedService
    state.lesson.cost = body.cost
    state.lesson.participantsCount = body.participantsCount
    state.lesson.pricePerPerson = body.pricePerPerson
    state.lesson.bookings[0].costAmount = body.cost
    if (body.prepaymentAmount) state.receipts.push({ id: id(6), amount: body.prepaymentAmount, method: body.prepaymentMethod, description: 'Предоплата за занятие' })
    return route.fulfill({ status: 201, json: state.lesson })
  })
  await page.route(`**/api/lessons/${id(4)}/complete`, async route => {
    if (state.fail) return route.fulfill({ status: 500, json: { message: 'Не удалось провести доплату' } })
    const body = route.request().postDataJSON(); state.posts.push(body)
    const lesson = state.lesson!
    if (body.payRemaining && lesson.status !== 'COMPLETED' && Number(lesson.prepaymentAmount) < Number(lesson.cost)) {
      lesson.finalPaymentAmount = Number(lesson.cost) - Number(lesson.prepaymentAmount); lesson.paymentStatus = 'PAID'
      state.receipts.push({ id: id(7), amount: Number(lesson.finalPaymentAmount), method: body.paymentMethod, description: 'Доплата за занятие' })
    }
    lesson.status = 'COMPLETED'
    return route.fulfill({ json: lesson })
  })
  await page.route('**/api/payments/shifts/current', route => route.fulfill({ json: null }))
  await page.route('**/api/finance/expenses?*', route => route.fulfill({ json: { data: [], total: 0 } }))
  await page.route('**/api/finance/summary?*', route => {
    const cash = state.receipts.filter(r => r.method === 'CASH').reduce((sum, r) => sum + r.amount, 0)
    const card = state.receipts.filter(r => r.method === 'CARD').reduce((sum, r) => sum + r.amount, 0)
    return route.fulfill({ json: { totalCash: cash, totalCard: card, totalRevenue: cash + card, balanceCash: cash, balanceCard: card, balanceTotal: cash + card, totalExpenses: 0, totalExpensesCash: 0, totalExpensesCard: 0, netTotal: cash + card, operationsCount: state.receipts.length,
      operations: state.receipts.map(r => ({ ...r, service: { title: r.description }, client, paidAt: '2026-10-20T08:00:00Z', cashier: { email: 'qa@example.com' }, status: 'PAID' })) } })
  })
  return state
}

async function choose(page: Page, form: Locator, label: string, text: string) {
  await form.getByRole('combobox', { name: new RegExp(`${label}$`) }).click()
  await page.locator('.ant-select-dropdown:visible').getByText(text, { exact: true }).click()
}

for (const width of [1440, 390]) test(`excursion for 20 guests calculates total and posts prepayment at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  const state = await setup(page, undefined, true)
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Новое занятие', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Быстрое бронирование' })
  await choose(page, form, 'Услуга', 'Экскурсия')
  await choose(page, form, 'Тренер', trainer.name)
  await choose(page, form, 'Клиент', client.name)
  await form.getByRole('button', { name: '20', exact: true }).click()
  await expect(form.getByLabel('Количество участников')).toHaveValue('20')
  await expect(form.getByLabel('Итоговая стоимость (₽)')).toHaveValue('10000.00')
  await expect(form).toContainText('Для экскурсий выбор лошади необязателен')
  await form.getByRole('switch', { name: 'Внесена предоплата' }).click()
  await form.getByLabel('Сумма предоплаты (₽)').fill('3000')
  await form.getByRole('button', { name: 'Создать занятие', exact: true }).click()
  await expect(form).not.toBeVisible()
  expect(state.posts[0]).toMatchObject({ participantsCount: 20, pricePerPerson: 500, cost: 10000, prepaymentAmount: 3000 })
  expect(state.lesson?.bookings[0].horse).toBeNull()
  await page.goto('/cash-desk')
  await expect(page.getByText('Предоплата за занятие', { exact: true })).toBeVisible()
  expect(state.receipts[0].amount).toBe(3000)
  await page.goto('/schedule')
  await page.locator('.fc-event').first().click()
  await expect(page.getByRole('dialog', { name: 'Карточка занятия' })).toContainText('20 чел.')
  await page.getByRole('button', { name: 'Отметить присутствие' }).click()
  const completion = page.getByRole('dialog', { name: 'Занятие состоялось' })
  await expect(completion).toContainText('7 000 ₽')
  await completion.getByText('Оплачено картой', { exact: true }).click()
  await page.screenshot({ path: `test-results/excursion-${width}.png`, fullPage: true, animations: 'disabled' })
  await completion.getByRole('button', { name: 'Завершить занятие', exact: true }).click()
  await expect(completion).not.toBeVisible()
  expect(state.receipts.map(row => row.amount)).toEqual([3000, 7000])
})

for (const width of [1440, 390]) test(`cash prepayment and card completion appear in cashbox at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  const state = await setup(page)
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Новое занятие', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Быстрое бронирование' })
  await choose(page, form, 'Услуга', service.title)
  await choose(page, form, 'Тренер', trainer.name)
  await choose(page, form, 'Клиент', client.name)
  await expect(form.getByLabel('Стоимость услуги (₽)')).toHaveValue('1500.00')
  await form.getByRole('switch', { name: 'Внесена предоплата' }).click()
  await form.getByLabel('Сумма предоплаты (₽)').fill('500')
  await form.getByText('Наличные', { exact: true }).click()
  await form.getByRole('button', { name: 'Создать занятие', exact: true }).click()
  await expect(form).not.toBeVisible()
  expect(state.posts[0]).toMatchObject({ cost: 1500, prepaymentAmount: 500, prepaymentMethod: 'CASH' })
  await page.goto('/cash-desk')
  await expect(page.getByText('Предоплата за занятие', { exact: true })).toBeVisible()
  expect(state.receipts).toHaveLength(1)
  await page.goto('/schedule')
  await page.locator('.fc-event').first().click()
  await page.getByRole('button', { name: 'Отметить присутствие' }).click()
  const completion = page.getByRole('dialog', { name: 'Занятие состоялось' })
  await expect(completion).toContainText('1 000 ₽')
  await completion.getByText('Оплачено картой', { exact: true }).click()
  await page.screenshot({ path: `test-results/lesson-payment-${width}.png`, fullPage: true, animations: 'disabled' })
  await completion.getByRole('button', { name: 'Завершить занятие', exact: true }).click()
  await expect(completion).not.toBeVisible()
  expect(state.lesson?.paymentStatus).toBe('PAID')
  expect(state.receipts.map(r => [r.amount, r.method])).toEqual([[500, 'CASH'], [1000, 'CARD']])
  await page.goto('/cash-desk')
  await expect(page.getByText('Предоплата за занятие', { exact: true })).toBeVisible()
  await expect(page.getByText('Доплата за занятие', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('completion retains payment choice on error and fully prepaid lessons need no collection', async ({ page }) => {
  const state = await setup(page, 500)
  await page.goto('/schedule'); await page.locator('.fc-event').first().click()
  await page.getByRole('button', { name: 'Отметить присутствие' }).click()
  const dialog = page.getByRole('dialog', { name: 'Занятие состоялось' })
  await dialog.getByText('Оплачено картой', { exact: true }).click()
  state.fail = true
  await dialog.getByRole('button', { name: 'Завершить занятие' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Не удалось провести доплату')
  await expect(dialog.getByRole('radio', { name: 'Оплачено картой' })).toBeChecked()
  state.fail = false
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
  state.lesson!.prepaymentAmount = 1500; state.lesson!.paymentStatus = 'PAID'
  await page.reload(); await page.locator('.fc-event').first().click()
  await page.getByRole('button', { name: 'Отметить присутствие' }).click()
  await expect(dialog).toContainText('Занятие полностью предоплачено')
  await expect(dialog.getByRole('radio')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Завершить занятие' }).click()
  await expect(dialog).not.toBeVisible()
  expect(state.receipts).toHaveLength(0)
})

for (const width of [1440, 1024, 768]) test(`calendar cards contain only time and trainer at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  const state = await setup(page, 500)
  const longName = 'Мария Александровна Оченьдлиннаяфамилия Тренера'
  state.lesson!.trainer = { ...trainer, fullName: longName }
  state.lesson!.endTime = '2026-10-20T09:30:00Z'
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [state.lesson, { ...state.lesson, id: id(40), startTime: state.lesson!.endTime, endTime: '2026-10-20T10:00:00Z' }] }))
  await page.goto('/schedule')
  const event = page.locator('.fc-event').first()
  await expect(event.locator('.schedule-event-content > div')).toHaveText(['12:00 - 12:30', longName])
  await expect(event.locator('.ant-tag, .horse-workload-badge')).toHaveCount(0)
  await expect(event).toHaveAttribute('title', new RegExp(`${longName}.*Анна Орлова.*Без лошади.*Предоплата`))
  expect(await event.evaluate(el => {
    const content = el.querySelector('.schedule-event-content')!
    const trainer = el.querySelector('.schedule-event-trainer')!
    const outer = el.getBoundingClientRect(), inner = content.getBoundingClientRect(), line = trainer.getBoundingClientRect()
    return inner.left >= outer.left && inner.right <= outer.right && inner.bottom <= outer.bottom
      && line.bottom <= outer.bottom
      && getComputedStyle(el).overflow === 'hidden' && getComputedStyle(trainer).textOverflow === 'ellipsis'
      && getComputedStyle(trainer).whiteSpace === 'nowrap'
  })).toBe(true)
  const first = await event.boundingBox(), next = await page.locator('.fc-event').nth(1).boundingBox()
  expect(first!.y + first!.height).toBeLessThanOrEqual(next!.y)
  await page.screenshot({ path: `test-results/calendar-compact-${width}.png`, fullPage: true, animations: 'disabled' })
  await event.focus()
  await event.press('Enter')
  const detail = page.getByRole('dialog', { name: 'Карточка занятия' })
  await expect(detail).toContainText(client.name)
  await expect(detail).toContainText(service.title)
  await expect(detail).toContainText(longName)
  await expect(detail).toContainText('Предоплата')
  await expect(detail.getByRole('button', { name: 'Отметить присутствие' })).toBeVisible()
})

test('calendar shows a compact excursion label or a fallback for a missing trainer', async ({ page }) => {
  const state = await setup(page, 0)
  state.lesson!.trainer = { ...trainer, name: '' }
  state.lesson!.pricePerPerson = 500
  state.lesson!.participantsCount = 20
  await page.goto('/schedule')
  await expect(page.locator('.schedule-event-trainer')).toHaveText('Экскурсия (20 чел.)')
  state.lesson!.pricePerPerson = null
  await page.reload()
  await expect(page.locator('.schedule-event-trainer')).toHaveText('Без тренера')
})

for (const width of [1440, 390]) test(`lesson deletion confirms client, membership and cash history at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  const state = await setup(page, 500)
  state.lesson!.bookings[0].membership = { id: id(8), totalLessons: 8, remainedLessons: 7, validUntil: '2026-12-31T00:00:00Z' }
  let deletions = 0
  await page.route(`**/api/lessons/${id(4)}`, async route => {
    expect(route.request().method()).toBe('DELETE')
    deletions++; state.lesson = undefined
    await route.fulfill({ json: { success: true, message: 'Занятие успешно удалено' } })
  })
  await page.goto('/schedule')
  await page.locator('.fc-event').first().click()
  const detail = page.getByRole('dialog', { name: 'Карточка занятия' })
  await detail.getByRole('button', { name: 'Удалить занятие', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Удалить занятие?', exact: true })
  await expect(confirm).toContainText('20 окт. 2026, 12:00')
  await expect(confirm).toContainText(client.name)
  await expect(confirm).toContainText('Списанное занятие будет возвращено на баланс абонемента')
  await expect(confirm).toContainText('500 ₽. Кассовые чеки сохранятся в истории кассы')
  await expect(confirm.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
  await confirm.getByRole('button', { name: 'Отмена', exact: true }).click()
  expect(deletions).toBe(0)
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: 'Удалить занятие', exact: true }).click()
  await expect(confirm).toBeVisible()
  await expect(confirm.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
  await page.screenshot({ path: `test-results/lesson-deletion-${width}.png`, animations: 'disabled' })
  await confirm.getByRole('button', { name: 'Удалить занятие', exact: true }).click()
  await expect(confirm).not.toBeVisible()
  await expect(detail).not.toBeVisible()
  await expect(page.getByText('Занятие удалено из расписания', { exact: true })).toBeVisible()
  await expect(page.locator('.fc-event')).toHaveCount(0)
  expect(deletions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('lesson deletion preserves the dialog on error and blocks duplicate requests while busy', async ({ page }) => {
  const state = await setup(page, 0)
  let deletions = 0
  let finish: (() => void) | undefined
  await page.route(`**/api/lessons/${id(4)}`, async route => {
    deletions++
    if (deletions === 1) return route.fulfill({ status: 500, json: { message: 'Не удалось сохранить изменения' } })
    await new Promise<void>(resolve => { finish = resolve })
    state.lesson = undefined
    await route.fulfill({ json: { success: true } })
  })
  await page.goto('/schedule'); await page.locator('.fc-event').first().click()
  await page.getByRole('button', { name: 'Удалить занятие', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Удалить занятие?', exact: true })
  const remove = confirm.getByRole('button', { name: 'Удалить занятие', exact: true })
  await remove.click()
  await expect(confirm.getByRole('alert')).toContainText('Не удалось сохранить изменения')
  await expect(page.locator('.fc-event')).toHaveCount(1)
  await remove.click()
  await expect(confirm.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeVisible()
  expect(deletions).toBe(2)
  finish!()
  await expect(page.locator('.fc-event')).toHaveCount(0)
})

for (const mode of ['TRAINER', 'READ_ONLY']) test(`lesson deletion is hidden for ${mode}`, async ({ page }) => {
  await setup(page, 0)
  if (mode === 'TRAINER') await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'TRAINER'))
  else await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'ADMIN', modules:
    ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: module === 'SCHEDULE' ? 'READ_ONLY' : 'FULL' })) } }))
  await page.goto('/schedule'); await page.locator('.fc-event').first().click()
  await expect(page.getByRole('dialog', { name: 'Карточка занятия' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Удалить занятие', exact: true })).toHaveCount(0)
})
