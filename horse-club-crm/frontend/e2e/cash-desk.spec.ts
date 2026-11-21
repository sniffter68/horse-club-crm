import { test, expect, type Page } from './fixtures'

for (const width of [1440, 1280, 1024, 390]) test(`balances and turnover contain long money at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await setup(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const queries: URL[] = []
  await page.route('**/api/finance/summary?*', route => {
    queries.push(new URL(route.request().url()))
    return route.fulfill({ json: { balanceCash: '99999999.99', balanceCard: '1250000', balanceTotal: '101249999.99',
      cashboxes: { mainBalance: '100000000', boardingBalance: '1249999.99' }, totalCash: '99999999.99', totalCard: '1250000', totalRevenue: '101249999.99', totalExpenses: '211610', operationsCount: 0, operations: [] } })
  })
  await page.route('**/api/cashbox/summary', route => route.fulfill({ json: { mainBalance: 100000000, boardingBalance: 1249999.99, mainOperationsCount: 1, boardingOperationsCount: 1, balanceCash: '99999999.99', balanceCard: '1250000' } }))
  await page.goto('/cash-desk')
  const cards = page.getByTestId('cash-metric-card')
  await expect(cards).toHaveCount(7)
  await expect(cards.first()).toContainText(/99\s999\s999,99/)
  await expect(cards.nth(1)).toContainText(/1\s250\s000,00/)
  await expect(page.getByTestId('header-cash')).toHaveText(await cards.first().locator('.ant-statistic-content').innerText())
  await expect(page.getByTestId('header-bank')).toHaveText(await cards.nth(1).locator('.ant-statistic-content').innerText())
  for (const label of ['Вчера', 'Текущая неделя', 'Текущий месяц', 'Текущая смена', 'Сегодня']) {
    await page.getByText(label, { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Обновить', exact: true })).not.toHaveClass(/ant-btn-loading/)
    await expect(cards.first()).toContainText(/99\s999\s999,99/)
  }
  expect(queries.some(url => url.searchParams.get('shiftId') === '00000000-0000-4000-8000-000000000005')).toBe(true)
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded()
    expect(await card.evaluate(element => {
      const content = element.querySelector('.ant-statistic-content')!
      const range = document.createRange(); range.selectNodeContents(content)
      const text = range.getBoundingClientRect(), bounds = element.getBoundingClientRect()
      return { fits: text.left >= bounds.left && text.right <= bounds.right, noClip: content.scrollWidth <= content.clientWidth + 1, nowrap: getComputedStyle(content).whiteSpace, numerals: getComputedStyle(content).fontVariantNumeric }
    })).toEqual({ fits: true, noClip: true, nowrap: 'nowrap', numerals: 'tabular-nums' })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await cards.first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `../docs/reports/cash-metrics-${width}.png`, animations: 'disabled' })
})

for (const width of [1440, 390]) test(`journal filters, empty state, retry and read only at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await setup(page, 'MANAGER')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: [{ module: 'CASHBOX', isEnabled: true, accessLevel: 'READ_ONLY' }] } }))
  let fail = false
  const queries: URL[] = []
  await page.route('**/api/payments/shifts', route => route.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000007', openedAt: '2026-10-08T07:00:00Z', closedAt: '2026-10-08T17:00:00Z', cashier: { email: 'manager@test' } }] }))
  await page.route('**/api/finance/journal?*', route => {
    const url = new URL(route.request().url()); queries.push(url)
    if (fail) return route.fulfill({ status: 500, json: { message: 'Ошибка журнала' } })
    return route.fulfill({ json: { total: url.searchParams.has('search') ? 0 : 1, data: url.searchParams.has('search') ? [] : [{ id: 'expense:x', kind: 'EXPENSE', at: '2026-10-09T09:00:00Z', amount: '1500', method: 'CASH', description: 'Возврат за отмену', clientName: 'Анна Орлова' }] } })
  })
  await page.goto('/cash-desk')
  await expect(page.getByText('Возврат за отмену', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Принять платёж', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Внести расход', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Закрыть смену', exact: true })).toBeDisabled()
  for (const [name, option] of [['Способ оплаты журнала', 'Безналичные'], ['Тип операции', 'Расход']]) {
    await page.getByRole('combobox', { name, exact: true }).focus()
    await page.getByRole('combobox', { name, exact: true }).press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click()
  }
  await expect.poll(() => queries.at(-1)?.searchParams.get('paymentMethod')).toBe('BANK')
  await expect.poll(() => queries.at(-1)?.searchParams.get('operationType')).toBe('EXPENSE')
  const shiftFilter = page.getByRole('combobox', { name: 'Смена журнала', exact: true })
  await shiftFilter.focus(); await shiftFilter.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText(/manager@test/).click()
  await expect.poll(() => queries.at(-1)?.searchParams.get('shiftId')).toBe('00000000-0000-4000-8000-000000000007')
  const search = page.getByRole('combobox', { name: 'Поиск по клиенту или комментарию' })
  await search.fill('Нет клиента'); await search.press('Enter')
  await expect(page.getByText('По выбранным фильтрам операций нет', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click()
  await expect(search).toBeFocused()
  await expect(page.getByText('Возврат за отмену', { exact: true })).toBeVisible()
  fail = true
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect(page.getByText('Не удалось загрузить журнал', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByText('Возврат за отмену', { exact: true })).toBeVisible()
})

test('invalid journal shift UUID is never sent and can be cleared', async ({ page }) => {
  await setup(page)
  const requests: string[] = []
  await page.route('**/api/finance/journal?*', route => { requests.push(route.request().url()); return route.fulfill({ json: { data: [], total: 0 } }) })
  await page.goto('/cash-desk?journalShift=invalid')
  await expect(page.getByText('Некорректная смена', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: 'Сбросить смену' }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(new URL(requests[0]).searchParams.has('shiftId')).toBe(false)
})

for (const source of ['lesson', 'membership']) test(`payment list settles ${source} through cash drawer rather than generic status update`, async ({ page }) => {
  const state = await setup(page)
  const bookingId = '00000000-0000-4000-8000-000000000008'
  const membership = source === 'membership'
  const link = membership ? { membershipId: bookingId, membership: { id: bookingId, pricingPlan: { name: '8 занятий' } } }
    : { bookingId, booking: { id: bookingId, lesson: { service: { title: 'Тренировка' } } } }
  let patches = 0
  await page.route('**/api/payments?*', route => route.fulfill({ json: [{ ...link, id: '00000000-0000-4000-8000-000000000009', clientId: '00000000-0000-4000-8000-000000000001', amount: '1200.10', method: 'CASH', status: state.paid ? 'PAID' : 'PENDING',
    client: { id: '00000000-0000-4000-8000-000000000001', name: 'Анна Орлова' } }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/payments/00000000-0000-4000-8000-000000000009', route => { patches++; return route.fulfill({ json: {} }) })
  await page.route('**/api/clients/00000000-0000-4000-8000-000000000001', route => route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000001', name: 'Анна Орлова' } }))
  await page.route('**/api/payments/cash-desk/options/*', route => route.fulfill({ json: { bookings: membership ? [] : [{ id: bookingId, startTime: '2026-10-09T09:00:00Z', remainingAmount: '1200.10', lesson: { service: { title: 'Тренировка' } } }], memberships: membership ? [{ id: bookingId, type: 'fixed_lessons', status: 'active', title: '8 занятий', payments: [{ status: 'PENDING', amount: '1200.10' }] }] : [] } }))
  await page.goto('/payments')
  await page.getByRole('button', { name: 'Оплачено', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Принять оплату / Касса', exact: true })
  await expect(drawer.getByRole('spinbutton', { name: 'Сумма чека, ₽' })).toHaveValue('1200.10')
  await drawer.getByRole('button', { name: 'Без сдачи', exact: true }).click()
  await drawer.getByRole('button', { name: 'Провести платёж', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  expect(patches).toBe(0)
  expect(state.posts).toHaveLength(1)
  expect(state.posts[0][membership ? 'membershipId' : 'bookingId']).toBe(bookingId)
  await expect(page.getByRole('button', { name: 'Оплачено', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Снять отметку', exact: true })).toHaveCount(0)
})

test('cash audit overview capture', async ({ page }) => {
  await setup(page)
  await page.goto('/cash-desk')
  await expect(page.getByText('Остаток в кассе (наличные)', { exact: true })).toBeVisible()
  await expect(page.locator('.cash-desk-page .ant-spin-spinning')).toHaveCount(0)
  await page.screenshot({ path: '../docs/reports/cash-audit-after.png', fullPage: true, animations: 'disabled' })
})

async function setup(page: Page, role = 'ADMIN') {
  await page.clock.setFixedTime(new Date('2026-10-09T09:00:00Z'))
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', sessionStorage.getItem('qa.role') || role)
  }, role)
  const state = { posts: [] as Record<string, unknown>[], summaries: [] as string[], fail: false, paid: false, expenses: [] as Record<string, unknown>[], expensePosts: [] as Record<string, unknown>[], expenseFail: false }
  await page.route('**/api/finance/journal?*', route => route.fulfill({ json: { total: state.paid ? 1 : 0, data: state.paid ? [{ id: 'payment:test', kind: 'INCOME', at: '2026-10-09T09:00:00Z', amount: '1200.10', method: 'CASH', clientName: 'Анна Орлова', description: 'Индивидуальная тренировка', cashier: 'qa@example.com' }] : [] } }))
  await page.route('**/api/finance/monthly-closing/status?*', route => route.fulfill({ json: {
    year: 2026, month: 10, isClosed: false, closedAt: null, cashFlowIncome: '8000', cashFlowExpense: '500',
    recognizedRevenue: '1000', deferredRevenueCarriedOver: '7000', activeMembershipsCarriedOver: 1,
  } }))
  await page.route(/\/api\/finance\/expenses(?:\/[^?]+)?(?:\?.*)?$/, route => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      state.expensePosts.push(payload)
      if (state.expenseFail) return route.fulfill({ status: 500, json: { message: 'Не удалось сохранить расход' } })
      if (!state.expenses.some(row => row.requestId === payload.requestId)) state.expenses.push({ id: '00000000-0000-4000-8000-000000000006', ...payload, createdBy: { email: 'qa@example.com' } })
      return route.fulfill({ status: 201, json: state.expenses[0] })
    }
    if (route.request().method() === 'DELETE') { state.expenses = []; return route.fulfill({ json: {} }) }
    const query = new URL(route.request().url()).searchParams
    const rows = state.expenses.filter(row => (!query.get('paymentMethod') || row.paymentMethod === query.get('paymentMethod')) && (!query.get('category') || row.category === query.get('category')))
    return route.fulfill({ json: { data: rows, total: rows.length } })
  })
  await page.route('**/api/finance/summary?*', route => {
    state.summaries.push(route.request().url())
    const expense = state.expenses.reduce((sum, row) => sum + Number(row.amount), 0)
    return route.fulfill({ json: { totalCash: state.paid ? '1200.10' : '0', totalCard: '0', totalRevenue: state.paid ? '1200.10' : '0', balanceCash: 5000 - expense, balanceCard: 2000, totalExpenses: expense, totalExpensesCash: expense, totalExpensesCard: 0, netTotal: -expense, operationsCount: state.paid ? 1 : 0, operations: state.paid ? [{ id: '00000000-0000-4000-8000-000000000004', amount: '1200.10', cashChange: '799.90', method: 'CASH', client: { name: 'Анна Орлова' }, service: { title: 'Индивидуальная тренировка' }, cashier: { email: 'qa@example.com' }, paidAt: '2026-10-09T09:00:00Z' }] : [] } })
  })
  await page.route('**/api/clients?*', route => route.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Анна Орлова', phone: '+79991234567' }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/services?*', route => route.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000003', title: 'Индивидуальная тренировка', price: '1200.10' }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/payments/cash-desk/options/*', route => route.fulfill({ json: { bookings: [], memberships: [] } }))
  await page.route('**/api/payments/shifts/current', route => route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000005', openedAt: '2026-10-09T07:00:00Z', startingCash: '1000' } }))
  await page.route('**/api/payments/summary?*', route => {
    state.summaries.push(route.request().url())
    return route.fulfill({ json: { totalCash: state.paid ? '1200.10' : '0', totalCard: '0', totalRevenue: state.paid ? '1200.10' : '0', operationsCount: state.paid ? 1 : 0, operations: state.paid ? [{ id: '00000000-0000-4000-8000-000000000004', amount: '1200.10', cashChange: '799.90', method: 'CASH', client: { name: 'Анна Орлова' }, service: { title: 'Индивидуальная тренировка' }, cashier: { email: 'qa@example.com' }, paidAt: '2026-10-09T09:00:00Z' }] : [] } })
  })
  await page.route('**/api/payments/cash-desk', route => {
    state.posts.push(route.request().postDataJSON())
    if (state.fail) return route.fulfill({ status: 500, json: { message: 'Ответ сервера потерян' } })
    state.paid = true
    return route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000004', cashChange: '799.90', method: state.posts.at(-1)?.method } })
  })
  return state
}
async function fillPayment(page: Page) {
  await page.getByRole('button', { name: 'Принять платёж', exact: true }).first().click()
  const modal = page.getByRole('dialog', { name: 'Принять оплату / Касса', exact: true })
  await modal.getByRole('combobox', { name: 'Клиент', exact: true }).fill('Анна')
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Анна Орлова · +79991234567', { exact: true })).toBeVisible()
  await modal.getByRole('combobox', { name: 'Клиент', exact: true }).press('Enter')
  await modal.getByRole('combobox', { name: 'Услуга / занятие / абонемент', exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Индивидуальная тренировка', { exact: true })).toBeVisible()
  await modal.getByRole('combobox', { name: 'Услуга / занятие / абонемент', exact: true }).press('Enter')
  return modal
}

for (const width of [1440, 390]) test(`monthly accrual closing preserves summary and recovers from failure at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page)
  let closed = false, fail = true
  const posts: unknown[] = []
  const report = (month = 9) => ({ year: 2026, month, isClosed: month === 9 && closed, closedAt: closed ? '2026-10-09T09:00:00Z' : null,
    cashFlowIncome: '8000', cashFlowExpense: '500', recognizedRevenue: '1000', deferredRevenueCarriedOver: '7000', activeMembershipsCarriedOver: 1,
    currentCashBalance: '10500', membershipsAdvanceSummary: { totalAdvance: '7000', rows: [{ membershipId: '00000000-0000-4000-8000-000000000007', clientId: '00000000-0000-4000-8000-000000000001', clientName: 'Анна Орлова', membershipTitle: '8 занятий', remainingLessons: 7, pricePerLesson: '1000', amountToCarryOver: '7000' }] },
    openingBalance: month === 10 && closed ? { incomingCashBalance: '10500', incomingAdvanceBalance: '7000' } : null })
  await page.route('**/api/finance/monthly-closing/status?*', route => route.fulfill({ json: report(Number(new URL(route.request().url()).searchParams.get('month'))) }))
  await page.route('**/api/finance/monthly-closing/preview?*', route => route.fulfill({ json: report() }))
  await page.route('**/api/finance/monthly-closing/confirm', route => {
    posts.push(route.request().postDataJSON())
    if (fail) return route.fulfill({ status: 409, json: { message: 'Баланс изменился. Повторите закрытие' } })
    closed = true
    return route.fulfill({ json: report() })
  })
  await page.goto('/cash-desk')
  const panel = page.locator('.ant-card').filter({ hasText: 'Учет выручки по месяцам' })
  await expect(panel.getByText('Признанная выручка', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Закрыть месяц', exact: true })).toBeEnabled()
  const month = page.getByRole('textbox', { name: 'Месяц финансового отчета' })
  await month.fill('09.2026'); await month.press('Enter'); await month.press('Escape')
  await panel.getByRole('button', { name: 'Закрыть месяц', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Закрытие месяца и перенос сальдо' })
  await expect(dialog).toContainText('Сумма авансов по неоткатанным абонементам')
  await expect(dialog.getByRole('button', { name: 'Вернуться к отчету' })).toBeFocused()
  await expect(dialog).toContainText('Фактический остаток денег в кассе на конец месяца')
  await dialog.getByRole('button', { name: 'Кому и сколько занятий переносим' }).click()
  await expect(dialog).toContainText('Анна Орлова')
  const cashValue = dialog.locator('.ant-descriptions-item-content').first()
  await expect(cashValue).toHaveCSS('white-space', 'nowrap')
  await dialog.getByLabel('Комментарий к закрытию (необязательно)').fill('Сверено')
  const confirm = dialog.getByRole('button', { name: 'Подтвердить и перенести остатки в октябрь 2026' })
  await confirm.click()
  await expect(dialog.getByRole('alert')).toContainText('Баланс изменился')
  expect(posts).toEqual([{ year: 2026, month: 9, notes: 'Сверено' }])
  await expect(dialog.getByLabel('Комментарий к закрытию (необязательно)')).toHaveValue('Сверено')
  fail = false
  await expect(confirm).toBeEnabled()
  const confirmBounds = await confirm.boundingBox()
  expect(confirmBounds!.y + confirmBounds!.height).toBeLessThanOrEqual(900)
  await page.screenshot({ path: `../test-results/monthly-closing-dialog-${width}.png`, fullPage: true })
  await confirm.click()
  await expect(dialog).not.toBeVisible()
  await expect(panel.getByText('Месяц закрыт', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Закрыть месяц', exact: true })).toHaveCount(0)
  await month.fill('10.2026'); await month.press('Enter'); await month.press('Escape')
  await expect(panel.getByText(/Перенесено с прошлого месяца: Касса/)).toContainText('Авансы по абонементам')
  await page.screenshot({ path: `../test-results/monthly-accrual-${width}.png`, fullPage: true })
})

test('monthly preview failure can retry; empty balances close once and show zero incoming balance', async ({ page }) => {
  await setup(page)
  let previewAttempts = 0, confirmations = 0
  const empty = { year: 2026, month: 9, isClosed: false, closedAt: null,
    cashFlowIncome: '0', cashFlowExpense: '0', recognizedRevenue: '0', deferredRevenueCarriedOver: '0',
    activeMembershipsCarriedOver: 0, currentCashBalance: '0', membershipsAdvanceSummary: { totalAdvance: '0', rows: [] }, openingBalance: null }
  await page.route('**/api/finance/monthly-closing/preview?*', async route => {
    previewAttempts++
    if (previewAttempts === 1) return route.fulfill({ status: 503, json: { message: 'Сверка временно недоступна' } })
    return route.fulfill({ json: empty })
  })
  await page.route('**/api/finance/monthly-closing/confirm', async route => {
    confirmations++
    return route.fulfill({ json: { ...empty, isClosed: true } })
  })
  await page.goto('/cash-desk')
  const month = page.getByRole('textbox', { name: 'Месяц финансового отчета' })
  await month.fill('09.2026'); await month.press('Enter'); await month.press('Escape')
  await page.getByRole('button', { name: 'Закрыть месяц', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Закрытие месяца и перенос сальдо' })
  const confirm = dialog.getByRole('button', { name: /Подтвердить и перенести/ })
  await expect(dialog.getByRole('alert')).toContainText('Сверка временно недоступна')
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(confirm).toBeEnabled()
  const disclosure = dialog.getByRole('button', { name: 'Кому и сколько занятий переносим' })
  await disclosure.focus(); await disclosure.press('Enter')
  await expect(dialog).toContainText('Нет неиспользованных занятий для переноса')
  await confirm.click()
  await expect(dialog).not.toBeVisible()
  expect(confirmations).toBe(1)
  await page.route('**/api/finance/monthly-closing/status?*', route => route.fulfill({ json: { ...empty, month: 10,
    openingBalance: { incomingCashBalance: '0', incomingAdvanceBalance: '0' } } }))
  await month.fill('10.2026'); await month.press('Enter'); await month.press('Escape')
  await expect(page.getByText(/Перенесено с прошлого месяца: Касса/)).toContainText('0,00')
})

test('manager with FULL access can preview and close month', async ({ page }) => {
  await setup(page, 'MANAGER')
  await page.goto('/cash-desk')
  await expect(page.getByText('Переходящий остаток абонементов', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Закрыть месяц', exact: true })).toBeEnabled()
})

for (const width of [1440, 390]) test(`owner reset requires exact word, preserves failure and refreshes book at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const state = await setup(page)
  state.paid = true
  let reset = false, fail = true
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/cash/reset', route => {
    posts.push(route.request().postDataJSON())
    if (fail) return route.fulfill({ status: 500, json: { message: 'Не удалось записать аудит' } })
    reset = true
    return route.fulfill({ json: { success: true, currentBalance: 0 } })
  })
  await page.route('**/api/finance/summary?*', route => route.fulfill({ json: {
    balanceCash: reset ? 0 : 5000, balanceCard: reset ? 0 : 2000,
    totalExpenses: 0, operationsCount: reset ? 0 : 1,
    operations: reset ? [] : [{ id: '00000000-0000-4000-8000-000000000004', amount: '1000', method: 'CASH', paidAt: '2026-10-09T09:00:00Z', client: { name: 'Тестовый платёж' } }],
  } }))
  await page.route('**/api/finance/journal?*', route => route.fulfill({ json: { total: reset ? 0 : 1, data: reset ? [] : [{ id: 'payment:test', kind: 'INCOME', at: '2026-10-09T09:00:00Z', amount: '1000', method: 'CASH', clientName: 'Тестовый платёж' }] } }))
  await page.route('**/api/payments/shifts/current', route => route.fulfill({ json: reset ? null : { id: '00000000-0000-4000-8000-000000000005', openedAt: '2026-10-09T07:00:00Z', startingCash: '1000' } }))
  await page.goto('/cash-desk')
  await expect(page.getByText('Тестовый платёж', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Очистить журнал кассы', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Обнулить кассу?' })
  const submit = dialog.getByRole('button', { name: 'Обнулить кассу', exact: true })
  await expect(dialog.getByRole('button', { name: 'Сохранить кассу' })).toBeFocused()
  await expect(submit).toBeDisabled()
  const word = dialog.getByRole('textbox', { name: 'Для подтверждения введите СБРОСИТЬ' })
  await word.fill('сбросить'); await expect(submit).toBeDisabled()
  await word.fill('СБРОСИТЬ '); await expect(submit).toBeDisabled()
  await word.fill('СБРОСИТЬ')
  await page.screenshot({ path: `test-results/cash-reset-${width}.png`, fullPage: true, animations: 'disabled' })
  await submit.click()
  await expect(dialog.locator('.ant-alert-error')).toContainText('Не удалось записать аудит')
  await expect(word).toHaveValue('СБРОСИТЬ')
  fail = false; await submit.click()
  await expect(dialog).not.toBeVisible()
  expect(posts[0]).toEqual(posts[1])
  expect(posts[0].confirmation).toBe('RESET_CASH')
  await expect(page.getByText('Тестовый платёж', { exact: true })).not.toBeVisible()
  await expect(page.getByText('Нет открытой смены', { exact: true })).toBeVisible()
  await expect(page.getByTestId('cash-metric-card').filter({ hasText: 'Остаток в кассе (наличные)' })).toContainText('0,00')
  await expect(page.getByText('Касса успешно обнулена', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('owner withdrawal retries same operation after uncertain failure and permits correcting insufficient amount', async ({ page }) => {
  await setup(page)
  const posts: Record<string, unknown>[] = []
  let mode = 'invalid'
  await page.route('**/api/cash/withdraw', route => {
    posts.push(route.request().postDataJSON())
    return mode === 'invalid' ? route.fulfill({ status: 400, json: { message: 'Недостаточно наличных в кассе' } })
      : mode === 'failure' ? route.fulfill({ status: 500, json: { message: 'Ответ потерян' } })
      : route.fulfill({ json: { id: 'encashment' } })
  })
  await page.goto('/cash-desk')
  await page.getByRole('button', { name: 'Инкассация / Снятие выручки', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Инкассация / Снятие выручки' })
  const amount = dialog.getByRole('spinbutton', { name: 'Сумма инкассации, ₽' })
  await amount.fill('6000'); await dialog.getByRole('button', { name: 'Передать выручку' }).click()
  await expect(dialog.locator('.ant-alert-error')).toContainText('Недостаточно наличных')
  await expect(amount).toBeEnabled()
  mode = 'failure'; await amount.fill('1500'); await dialog.getByRole('button', { name: 'Передать выручку' }).click()
  await expect(dialog.locator('.ant-alert-error')).toContainText('Ответ потерян')
  await expect(amount).toBeDisabled()
  mode = 'success'; await dialog.getByRole('button', { name: 'Передать выручку' }).click()
  await expect(dialog).not.toBeVisible()
  expect(posts[1]).toEqual(posts[2]); expect(posts[1].amount).toBe(1500)
})

test('manager cannot see owner reset or withdrawal controls', async ({ page }) => {
  await setup(page, 'MANAGER'); await page.goto('/cash-desk')
  await expect(page.getByRole('button', { name: 'Обновить', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Очистить журнал кассы' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Инкассация / Снятие выручки' })).not.toBeVisible()
})
for (const width of [1440, 390]) test(`expense 1500 reduces cash balance, filters and admin cancellation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const state = await setup(page)
  await page.goto('/cash-desk')
  const balance = page.getByTestId('cash-metric-card').filter({ hasText: 'Остаток в кассе (наличные)' })
  await expect(balance).toContainText(/5\s*000,00/)
  await page.getByRole('button', { name: 'Внести расход', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Внесение расхода', exact: true })
  await dialog.getByRole('button', { name: 'Внести расход', exact: true }).click()
  await expect(dialog).toContainText('Введите положительную сумму')
  expect(state.expensePosts).toHaveLength(0)
  await dialog.getByRole('spinbutton', { name: 'Сумма (руб.)', exact: true }).fill('1500')
  await dialog.getByRole('combobox', { name: 'Статья / Категория', exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible')).toContainText('Опилки')
  await page.screenshot({ path: `test-results/expense-form-${width}.png`, fullPage: true })
  await page.locator('.ant-select-dropdown:visible').getByText('Опилки', { exact: true }).click()
  await dialog.getByRole('textbox', { name: 'На что потрачено', exact: true }).fill('Закупка опилок')
  await dialog.getByRole('button', { name: 'Внести расход', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Закупка опилок', { exact: true })).toBeVisible()
  await expect(balance).toContainText(/3\s*500,00/)
  expect(state.expensePosts).toHaveLength(1)
  expect(state.expensePosts[0]).toMatchObject({ amount: 1500, paymentMethod: 'CASH', category: 'BEDDING', description: 'Закупка опилок', date: '2026-10-09T12:00:00.000+03:00' })
  await page.getByRole('combobox', { name: 'Способ оплаты расходов' }).focus()
  await page.getByRole('combobox', { name: 'Способ оплаты расходов' }).press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Безнал', { exact: true }).click()
  await expect(page.getByText('За выбранный период расходов нет', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Способ оплаты расходов' }).focus()
  await page.getByRole('combobox', { name: 'Способ оплаты расходов' }).press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Наличные', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Категория расходов' }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('Опилки', { exact: true }).click()
  await expect(page.getByText('Закупка опилок', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Категория расходов' }).press('Escape')
  await page.screenshot({ path: `test-results/expense-history-${width}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Удалить расход', exact: true }).click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Отменить расход?' })
  await expect(confirm.getByRole('button', { name: 'Сохранить запись' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Отменить расход', exact: true }).click()
  await expect(balance).toContainText(/5\s*000,00/)
  await expect(page.getByText('Закупка опилок', { exact: true })).not.toBeVisible()
})
test('expense failure preserves payload for retry; manager cannot delete', async ({ page }) => {
  const state = await setup(page, 'MANAGER')
  await page.goto('/cash-desk')
  await page.getByRole('button', { name: 'Внести расход', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Внесение расхода' })
  await dialog.getByRole('spinbutton', { name: 'Сумма (руб.)' }).fill('1500')
  await dialog.getByText('Безналичные', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Статья / Категория' }).focus()
  await dialog.getByRole('combobox', { name: 'Статья / Категория' }).press('ArrowDown')
  await dialog.getByRole('combobox', { name: 'Статья / Категория' }).press('Enter')
  await dialog.getByRole('textbox', { name: 'На что потрачено' }).fill('Закупка сена')
  state.expenseFail = true
  await dialog.getByRole('button', { name: 'Внести расход', exact: true }).click()
  await expect(dialog.locator('.ant-alert-error')).toContainText('Не удалось сохранить расход')
  await expect(dialog.getByRole('textbox', { name: 'На что потрачено' })).toHaveValue('Закупка сена')
  state.expenseFail = false
  await dialog.getByRole('button', { name: 'Внести расход', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(state.expensePosts[0]).toEqual(state.expensePosts[1])
  await expect(page.getByText('Закупка сена', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Удалить расход', exact: true })).not.toBeVisible()
})
for (const width of [1440, 390]) test(`cash payment and book refresh at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const state = await setup(page)
  await page.goto('/cash-desk')
  const modal = await fillPayment(page)
  await expect(modal.getByRole('spinbutton', { name: 'Сумма чека, ₽', exact: true })).toHaveValue('1200.10')
  await modal.getByRole('button', { name: '+1000', exact: true }).click()
  await expect(modal.getByRole('button', { name: 'Провести платёж', exact: true })).toBeDisabled()
  await modal.getByRole('button', { name: '+1000', exact: true }).click()
  await expect(modal).toContainText('Сдача')
  await expect(modal).toContainText('799')
  await page.screenshot({ path: `test-results/cash-desk-${width}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await modal.getByRole('button', { name: 'Провести платёж', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await expect(page.getByText('Анна Орлова', { exact: true })).toBeVisible()
  expect(state.posts).toHaveLength(1)
  expect(state.posts[0]).toMatchObject({ clientId: '00000000-0000-4000-8000-000000000001', amount: 1200.1, cashGiven: 2000, method: 'CASH', serviceId: '00000000-0000-4000-8000-000000000003' })
  await page.getByText('Текущая неделя', { exact: true }).click()
  await expect.poll(() => new URL(state.summaries.at(-1)!).searchParams.get('from')).toBe('2026-10-05T00:00:00.000+03:00')
})
test('uncertain response preserves payload and operation key on retry', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/cash-desk')
  const modal = await fillPayment(page)
  await modal.getByRole('button', { name: 'Без сдачи', exact: true }).click()
  state.fail = true
  await modal.getByRole('button', { name: 'Провести платёж', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('Ответ сервера потерян')
  await expect(modal.getByRole('spinbutton', { name: 'Сумма чека, ₽', exact: true })).toBeDisabled()
  state.fail = false
  await modal.getByRole('button', { name: 'Провести платёж', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(state.posts).toHaveLength(2)
  expect(state.posts[0]).toEqual(state.posts[1])
})
test('noncash SBP skips cash input and trainer cannot access cash desk', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/cash-desk')
  const modal = await fillPayment(page)
  await modal.getByText('Безнал', { exact: true }).click()
  await expect(modal.getByRole('spinbutton', { name: 'Внесено клиентом, ₽', exact: true })).not.toBeVisible()
  await modal.locator('.ant-select-selector').filter({ has: page.getByRole('combobox', { name: 'Вид безналичной оплаты', exact: true }) }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('СБП', { exact: true }).click()
  await modal.getByRole('button', { name: 'Провести платёж', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(state.posts[0].method).toBe('SBP')
  expect(state.posts[0].cashGiven).toBeUndefined()
  await page.evaluate(() => sessionStorage.setItem('qa.role', 'TRAINER'))
  await page.reload()
  await expect(page).toHaveURL(/\/trainer$/)
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Принять платёж', exact: true })).not.toBeVisible()
})
test('custom date picker uses Russian calendar and Moscow date boundaries', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/cash-desk')
  await page.getByText('Выбрать даты', { exact: true }).click()
  const inputs = page.locator('.cash-desk-filters .ant-picker-input input')
  await inputs.first().click()
  await expect(page.locator('.ant-picker-dropdown:visible')).toContainText(/окт/i)
  await inputs.first().fill('01.10.2026')
  await inputs.first().press('Tab')
  await inputs.last().fill('09.10.2026')
  await inputs.last().press('Enter')
  await expect.poll(() => new URL(state.summaries.at(-1)!).searchParams.get('from')).toBe('2026-10-01T00:00:00.000+03:00')
  expect(new URL(state.summaries.at(-1)!).searchParams.get('to')).toBe('2026-10-10T00:00:00.000+03:00')
})

for (const width of [1440, 390]) test(`quick client creation preserves payment and selects new client at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const state = await setup(page)
  const clientPosts: Record<string, unknown>[] = []
  await page.route('**/api/clients/quick', route => {
    clientPosts.push(route.request().postDataJSON())
    return route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000002', name: 'Мария', phone: '+79995554433' } })
  })
  await page.goto('/cash-desk')
  const payment = await fillPayment(page)
  await payment.getByRole('spinbutton', { name: 'Сумма чека, ₽', exact: true }).fill('1450.50')
  await payment.getByRole('spinbutton', { name: 'Внесено клиентом, ₽', exact: true }).fill('2000')
  await payment.getByRole('textbox', { name: 'Комментарий', exact: true }).fill('Сохранить заметку')
  await payment.getByRole('combobox', { name: 'Клиент', exact: true }).focus()
  await payment.getByRole('combobox', { name: 'Клиент', exact: true }).press('ArrowDown')
  await page.getByRole('button', { name: '⚡ Разовый гость', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Разовый гость', exact: true })
  await expect(create).toBeVisible()
  await create.getByRole('textbox', { name: 'Имя', exact: true }).fill('Черновик')
  await expect(create).not.toHaveClass(/ant-zoom-(enter|appear)/)
  await create.getByRole('textbox', { name: 'Имя', exact: true }).press('Escape')
  await expect(create).not.toBeVisible()
  await expect(payment).toBeVisible()
  await expect(payment.getByRole('combobox', { name: 'Клиент', exact: true })).toBeFocused()
  await expect(payment).toContainText('Анна Орлова')
  await expect(payment.getByRole('spinbutton', { name: 'Сумма чека, ₽', exact: true })).toHaveValue('1450.50')
  await expect(payment.getByRole('spinbutton', { name: 'Внесено клиентом, ₽', exact: true })).toHaveValue('2000.00')
  expect(clientPosts).toHaveLength(0)
  await page.route('**/api/clients?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await payment.getByRole('combobox', { name: 'Клиент', exact: true }).fill('Мария')
  await expect(page.locator('.ant-select-dropdown:visible')).toContainText('Клиенты не найдены')
  await page.screenshot({ path: `test-results/quick-client-dropdown-${width}.png`, fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '⚡ Разовый гость', exact: true }).click()
  await expect(create.getByRole('textbox', { name: 'Имя', exact: true })).toHaveValue('Мария')
  await create.getByRole('textbox', { name: 'Телефон', exact: true }).fill('+79995554433')
  await expect(create.getByRole('textbox', { name: 'Телефон', exact: true })).toBeFocused()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await expect(create).not.toHaveClass(/ant-zoom-enter/)
  await page.screenshot({ path: `test-results/quick-client-${width}.png`, fullPage: true })
  await create.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()
  await expect(create).not.toBeVisible()
  await expect(payment).toContainText('Мария · +79995554433')
  await expect(payment).toContainText('Индивидуальная тренировка')
  await expect(payment.getByRole('spinbutton', { name: 'Сумма чека, ₽', exact: true })).toHaveValue('1450.50')
  await expect(payment.getByRole('spinbutton', { name: 'Внесено клиентом, ₽', exact: true })).toHaveValue('2000.00')
  await expect(payment.getByRole('textbox', { name: 'Комментарий', exact: true })).toHaveValue('Сохранить заметку')
  await expect(payment.getByRole('combobox', { name: 'Клиент', exact: true })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await payment.getByRole('button', { name: 'Провести платёж', exact: true }).click()
  expect(clientPosts).toEqual([{ name: 'Мария', phone: '+79995554433', isOneTime: true }])
  await expect(payment).not.toBeVisible()
  expect(state.posts[0]).toMatchObject({ clientId: '00000000-0000-4000-8000-000000000002', serviceId: '00000000-0000-4000-8000-000000000003', amount: 1450.5, cashGiven: 2000, method: 'CASH', notes: 'Сохранить заметку' })
})

test('quick client phone prefill, validation, failure and cancel retain noncash payment', async ({ page }) => {
  await setup(page)
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/clients/quick', async route => {
    posts.push(route.request().postDataJSON())
    await route.fulfill({ status: 409, json: { message: 'Клиент с таким телефоном уже существует' } })
  })
  await page.goto('/cash-desk')
  const payment = await fillPayment(page)
  await payment.getByText('Безнал', { exact: true }).click()
  await payment.getByRole('combobox', { name: 'Клиент', exact: true }).fill('+7 (999) 555-44-33')
  await page.getByRole('button', { name: '⚡ Разовый гость', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Разовый гость', exact: true })
  await expect(create.getByRole('textbox', { name: 'Телефон', exact: true })).toHaveValue('+7 (999) 555-44-33')
  await create.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()
  await expect(create).toContainText('Введите имя клиента')
  expect(posts).toHaveLength(0)
  await create.getByRole('textbox', { name: 'Имя', exact: true }).fill('Ольга')
  await create.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()
  await expect(create.getByRole('alert')).toContainText('Клиент с таким телефоном уже существует')
  await expect(create.getByRole('textbox', { name: 'Имя', exact: true })).toHaveValue('Ольга')
  await create.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(payment).toBeVisible()
  await expect(payment).toContainText('Анна Орлова')
  await expect(payment.getByRole('spinbutton', { name: 'Сумма чека, ₽', exact: true })).toHaveValue('1200.10')
  await expect(payment.getByRole('spinbutton', { name: 'Внесено клиентом, ₽', exact: true })).not.toBeVisible()
  await expect(payment.getByRole('button', { name: 'Провести платёж', exact: true })).toBeEnabled()
})


for (const role of ['ADMIN', 'MANAGER']) for (const width of [1440, 390]) test(`current month preview and early close for ${role} at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page, role)
  let closed = false, confirmations = 0
  const report = () => ({ year: 2026, month: 10, isClosed: closed, status: closed ? 'CLOSED' : undefined,
    closedAt: closed ? '2026-10-09T09:00:00Z' : null, cashFlowIncome: '8000', cashFlowExpense: '500',
    recognizedRevenue: '1000', deferredRevenueCarriedOver: '7000', currentCashBalance: '10500',
    activeMembershipsCarriedOver: 0, membershipsAdvanceSummary: { totalAdvance: '7000', rows: [] }, openingBalance: null, notes: closed ? 'Досрочно' : null })
  await page.route('**/api/finance/monthly-closing/status?*', route => route.fulfill({ json: report() }))
  await page.route('**/api/finance/monthly-closing/preview?*', route => route.fulfill({ json: report() }))
  await page.route('**/api/finance/monthly-closing/confirm', route => {
    expect(route.request().postDataJSON()).toEqual({ year: 2026, month: 10, notes: 'Досрочно' })
    confirmations++; closed = true
    return route.fulfill({ json: report() })
  })
  await page.goto('/cash-desk')
  const close = page.getByRole('button', { name: 'Закрыть месяц', exact: true })
  await expect(close).toBeEnabled(); await close.click()
  const dialog = page.getByRole('dialog', { name: 'Закрытие месяца и перенос сальдо' })
  await expect(dialog).toContainText('Текущий месяц еще не завершен. Закрытие зафиксирует текущую признанную выручку и перенесет остаток кассы и авансы по абонементам во входящее сальдо следующего месяца')
  await expect(dialog).toContainText('Фактическая признанная выручка')
  await expect(dialog).not.toHaveClass(/ant-zoom/)
  await page.screenshot({ path: `../test-results/current-month-${role}-${width}.png`, fullPage: true, animations: 'disabled' })
  await dialog.getByLabel('Комментарий к закрытию (необязательно)').fill('Досрочно')
  await dialog.getByRole('button', { name: /Подтвердить и перенести остатки в ноябрь 2026/ }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Месяц закрыт', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Просмотр отчета закрытия' }).click()
  const saved = page.getByRole('dialog', { name: 'Отчет закрытия месяца' })
  await expect(saved).toContainText('Зафиксированная ведомость за 2026-10')
  await expect(saved).toContainText('Комментарий к закрытию: Досрочно')
  await expect(saved.getByRole('button', { name: /Подтвердить и перенести/ })).toHaveCount(0)
  await expect(saved.getByText(/Текущий месяц еще не завершен/)).toHaveCount(0)
  await saved.getByRole('button', { name: 'Вернуться к отчету' }).press('Escape')
  await expect(saved).not.toBeVisible()
  expect(confirmations).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('READ_ONLY manager cannot close open month', async ({ page }) => {
  await setup(page, 'MANAGER')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER',
    modules: [{ module: 'CASHBOX', isEnabled: true, accessLevel: 'READ_ONLY' }] } }))
  await page.goto('/cash-desk')
  await expect(page.getByText('Доступно только для просмотра', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Закрыть месяц', exact: true })).toHaveCount(0)
})
