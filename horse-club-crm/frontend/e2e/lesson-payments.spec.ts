import { test, expect, type Page, type Locator } from './fixtures'
import type { Lesson } from '../src/pages/schedule/types'

const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
const client = { id: id(1), name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567' }
const trainer = { id: id(2), name: 'Мария' }
const service = { id: id(3), title: 'Разовая тренировка', name: 'Разовая тренировка', price: '1500', durationMinutes: 60, maxCapacity: 1, allowMembership: false }

async function setup(page: Page, prepaid?: number) {
  await page.clock.setFixedTime(new Date('2026-10-20T08:00:00Z'))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  const state = { lesson: undefined as Lesson | undefined, receipts: [] as { id: string; amount: number; method: string; description: string }[], posts: [] as Record<string, unknown>[], fail: false }
  const makeLesson = (amount: number): Lesson => ({ id: id(4), status: 'SCHEDULED', startTime: '2026-10-20T09:00:00Z', endTime: '2026-10-20T10:00:00Z',
    trainer, service, arena: null, cost: 1500, prepaymentAmount: amount, prepaymentMethod: 'CASH', finalPaymentAmount: 0,
    paymentStatus: amount === 1500 ? 'PAID' : amount ? 'PARTIALLY_PAID' : 'UNPAID', bookings: [{ id: id(5), client, horse: null, membership: null, costAmount: 1500 }] })
  if (prepaid !== undefined) state.lesson = makeLesson(prepaid)
  for (const [resource, rows] of Object.entries({ clients: [client], trainers: [trainer], services: [service], horses: [], arenas: [] })) {
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
    if (body.prepaymentAmount) state.receipts.push({ id: id(6), amount: body.prepaymentAmount, method: body.prepaymentMethod, description: 'Предоплата за занятие' })
    return route.fulfill({ status: 201, json: state.lesson })
  })
  await page.route(`**/api/lessons/${id(4)}/complete`, async route => {
    if (state.fail) return route.fulfill({ status: 500, json: { message: 'Не удалось провести доплату' } })
    const body = route.request().postDataJSON(); state.posts.push(body)
    const lesson = state.lesson!
    if (body.payRemaining && lesson.status !== 'COMPLETED' && Number(lesson.prepaymentAmount) < 1500) {
      lesson.finalPaymentAmount = 1500 - Number(lesson.prepaymentAmount); lesson.paymentStatus = 'PAID'
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
