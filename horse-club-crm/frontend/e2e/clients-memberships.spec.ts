import { test, expect, type Page } from './fixtures'

for (const width of [1280, 390]) test(`family membership access adds, retries and revokes at ${width}px`, async ({ page }) => {
  test.setTimeout(45000)
  await page.setViewportSize({ width, height: 900 })
  const ownerId = '00000000-0000-4000-8000-000000000031'
  const childId = '00000000-0000-4000-8000-000000000032'
  const membershipId = '00000000-0000-4000-8000-000000000033'
  const mother = { ...client, id: ownerId, name: 'Елена Смирнова', firstName: 'Елена', lastName: 'Смирнова' }
  const child = { ...client, id: childId, name: 'Мария Смирнова', firstName: 'Мария', lastName: 'Смирнова', membership: null }
  let members: { clientId: string; client: typeof child }[] = []
  let reject = true
  await page.route('**/api/clients?*', route => route.fulfill({ json: [mother, child], headers: { 'x-total-count': '2' } }))
  await page.route(`**/api/clients/${ownerId}`, route => route.fulfill({ json: { ...mother, memberships: [{
    id: membershipId, totalLessons: 8, remainedLessons: 4, validUntil: '2099-01-01T00:00:00Z', isActive: true,
    members, payments: [], pricingPlan: { id: 'plan', name: 'Семейный — 8 занятий' },
  }], boardingContracts: [], payments: [], bookings: [] } }))
  await page.route(`**/api/memberships/${membershipId}/members`, async route => {
    expect(route.request().postDataJSON()).toEqual({ clientId: childId })
    if (reject) return route.fulfill({ status: 409, json: { message: 'Доступ изменился. Повторите действие.' } })
    members = [{ clientId: childId, client: child }]
    await route.fulfill({ status: 201, json: members[0] })
  })
  await page.route(`**/api/memberships/${membershipId}/members/${childId}`, async route => {
    expect(route.request().method()).toBe('DELETE'); members = []
    await route.fulfill({ json: { membershipId, clientId: childId } })
  })
  await page.goto('/clients')
  await page.getByRole('button', { name: mother.name, exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Карточка клиента' })
  const section = dialog.getByRole('region', { name: 'Совместный доступ' })
  await section.getByRole('button', { name: 'Добавить клиента', exact: true }).click()
  const search = section.getByRole('combobox', { name: 'Клиент для совместного доступа' })
  await search.fill('Мария')
  await expect(page.locator('.ant-select-dropdown:visible').getByText(/Мария Смирнова/)).toBeVisible()
  await search.press('ArrowDown'); await search.press('Enter')
  await section.getByRole('button', { name: 'Добавить клиента', exact: true }).click()
  await expect(section.getByRole('alert')).toContainText('Доступ изменился')
  reject = false
  await section.getByRole('button', { name: 'Добавить клиента', exact: true }).click()
  await expect(section.getByRole('button', { name: 'Отвязать клиента' })).toBeVisible()
  await expect(section).toContainText('Мария Смирнова')
  await page.screenshot({ path: `test-results/shared-family-${width}.png`, fullPage: true })
  await section.getByRole('button', { name: 'Отвязать клиента' }).click()
  await page.getByRole('button', { name: 'Отключить доступ', exact: true }).click()
  await expect(section).toContainText('Дополнительных участников нет')
})

test('family membership beneficiary sees owner badge without owner mutation controls', async ({ page }) => {
  const childId = '00000000-0000-4000-8000-000000000032'
  const child = { ...client, id: childId, name: 'Мария Смирнова', firstName: 'Мария', lastName: 'Смирнова' }
  await page.route('**/api/clients?*', route => route.fulfill({ json: [child], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/clients/${childId}`, route => route.fulfill({ json: { ...child, memberships: [{
    id: '00000000-0000-4000-8000-000000000033', isShared: true, ownerName: 'Елена Смирнова', totalLessons: 8,
    remainedLessons: 4, validUntil: '2099-01-01T00:00:00Z', isActive: true, payments: [], pricingPlan: null,
  }], boardingContracts: [], bookings: [], payments: [] } }))
  await page.goto('/clients'); await page.getByRole('button', { name: child.name, exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Карточка клиента' })
  await expect(dialog.getByText('Доступен семейный абонемент: Елена Смирнова (ост. 4 зан.)')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Добавить клиента', exact: true })).toHaveCount(0)
})

const client = { id: 'client-a', name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова',
  phone: '+79991234567', isRider: true, isPayer: true, preferences: '', createdAt: '2026-10-01T10:00:00Z',
  membership: { id: 'm-a', planName: 'Клубный · 8 занятий', remainingUnits: 5, totalUnits: 8,
    validUntil: '2099-12-31T12:00:00Z', status: 'ACTIVE' } }

test.beforeEach(async ({ page }) => {
  await page.route('**/api/services?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', 'ADMIN')
  })
  await page.route('**/api/clients?*', route => route.fulfill({
    json: [client, { ...client, id: 'client-b', name: 'Борис Иванов', firstName: 'Борис', lastName: 'Иванов', membership: null }],
    headers: { 'x-total-count': '2' },
  }))
})

const saleClientId = '00000000-0000-4000-8000-000000000021'
const saleServiceId = '00000000-0000-4000-8000-000000000022'
async function setupSale(page: Page) {
  const state = { posts: [] as Record<string, unknown>[], receipts: [] as Record<string, unknown>[], fail: false, disabled: false,
    failure: null as null | { status: number; json: Record<string, unknown> } }
  await page.route('**/api/clients?*', route => route.fulfill({ json: [{ ...client, id: saleClientId }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/pricing-plans?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/services?*', route => route.fulfill({ json: [{ id: saleServiceId, title: 'Выездка', price: '1250.15', allowMembership: true }], headers: { 'x-total-count': '1' } }))
  await page.route(/\/api\/memberships(?:\?.*)?$/, route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
    const payload = route.request().postDataJSON()
    state.posts.push(payload)
    if (state.failure) return route.fulfill(state.failure)
    if (state.fail) return route.fulfill({ status: 500, json: { message: 'Ответ сервера потерян' } })
    if (!state.disabled && !state.receipts.some(row => row.requestId === payload.requestId)) state.receipts.push({ ...payload, id: 'receipt', amount: payload.totalPrice, method: payload.paymentMethod, paidAt: new Date().toISOString(),
      client: { name: 'Анна Орлова' }, service: { title: 'Выездка' }, cashier: { email: 'qa@example.com' } })
    return route.fulfill({ status: 201, json: { id: 'membership', ...payload, cashboxPosted: !state.disabled } })
  })
  await page.route('**/api/payments/shifts/current', route => route.fulfill({ json: null }))
  await page.route('**/api/finance/summary?*', route => {
    const cash = state.receipts.filter(row => row.method === 'CASH').reduce((sum, row) => sum + Number(row.amount), 0)
    const card = state.receipts.filter(row => row.method === 'CARD').reduce((sum, row) => sum + Number(row.amount), 0)
    return route.fulfill({ json: { totalCash: cash, totalCard: card, totalRevenue: cash + card, balanceCash: cash, balanceCard: card, balanceTotal: cash + card,
      totalExpenses: 0, totalExpensesCash: 0, totalExpensesCard: 0, netTotal: cash + card, operationsCount: state.receipts.length, operations: state.receipts } })
  })
  return state
}
async function fillSale(page: Page) {
  await page.goto(`/memberships/new?clientId=${saleClientId}`)
  const drawer = page.getByRole('dialog', { name: 'Продажа абонемента', exact: true })
  await expect(drawer.locator('.ant-select-selection-item').first()).toContainText('Анна Орлова')
  const service = drawer.getByRole('combobox', { name: 'Услуга', exact: true })
  await expect(service).toBeEnabled()
  await service.focus(); await service.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible').getByText(/Выездка/)).toBeVisible()
  await expect.poll(async () => {
    const popup = await page.locator('.ant-select-dropdown:visible').boundingBox()
    return popup ? popup.x + popup.width : Infinity
  }).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  await page.screenshot({ path: `test-results/membership-service-popup-${page.viewportSize()!.width}.png` })
  await service.press('Enter')
  await drawer.getByRole('button', { name: '8 занятий', exact: true }).click()
  await expect(drawer.getByRole('spinbutton', { name: 'Итоговая стоимость к оплате (₽)', exact: true })).toHaveValue('10001.20')
  return drawer
}

for (const [method, width] of [['CASH', 1280], ['CARD', 390]] as const) test(`membership sale ${method} at ${width}px posts discounted payment to cash book`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  const state = await setupSale(page)
  await page.addInitScript(() => { window.addEventListener('cash-desk-paid', () => sessionStorage.setItem('sale-event', 'paid')) })
  const drawer = await fillSale(page)
  await drawer.getByRole('spinbutton', { name: 'Итоговая стоимость к оплате (₽)', exact: true }).fill('9500.25')
  if (method === 'CARD') await drawer.getByText('Безналичные', { exact: true }).click()
  await expect(drawer.getByText(/Сумма .* будет автоматически учтена/)).toBeVisible()
  await page.screenshot({ path: `test-results/membership-sale-${width}.png`, fullPage: true })
  await drawer.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(page.getByText(/Абонемент оформлен, оплата .* проведена в кассу/)).toBeVisible()
  await expect(page).toHaveURL(/\/memberships$/)
  expect(state.posts[0]).toMatchObject({ clientId: saleClientId, serviceId: saleServiceId, totalLessons: 8, totalPrice: 9500.25, paymentMethod: method })
  expect(await page.evaluate(() => sessionStorage.getItem('sale-event'))).toBe('paid')
  await page.goto('/cash-desk')
  await expect(page.getByText('Выездка', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/9\s500,25/).first()).toBeVisible()
  await expect(page.getByText(method === 'CASH' ? 'Наличные' : 'Карта', { exact: true }).first()).toBeVisible()
  expect(state.receipts).toHaveLength(1)
  expect(state.receipts[0].method).toBe(method)
})

test('membership sale uncertain retry keeps the same payload and operation key', async ({ page }) => {
  const state = await setupSale(page)
  const drawer = await fillSale(page)
  state.fail = true
  await drawer.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(drawer.getByRole('alert').first()).toContainText('Повторите продажу')
  await expect(drawer.getByRole('combobox', { name: 'Услуга', exact: true })).toBeDisabled()
  state.fail = false
  await drawer.getByRole('button', { name: 'Повторить продажу', exact: true }).click()
  await expect(page).toHaveURL(/\/memberships$/)
  expect(state.posts).toHaveLength(2)
  expect(state.posts[0]).toEqual(state.posts[1])
  expect(state.receipts).toHaveLength(1)
})

for (const status of [400, 503]) test(`membership sale ${status} after confirmed rollback preserves editable draft and uses a new key`, async ({ page }) => {
  const state = await setupSale(page)
  const drawer = await fillSale(page)
  const message = status === 400 ? 'Укажите корректную стоимость' : 'База данных не обновлена. Администратору нужно применить миграции и перезапустить сервер.'
  state.failure = { status, json: { message, details: { rollbackConfirmed: true } } }
  await drawer.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(drawer.getByRole('alert').first()).toHaveText(message)
  await expect(drawer.getByRole('combobox', { name: 'Услуга', exact: true })).toBeEnabled()
  await expect(drawer.getByRole('spinbutton', { name: 'Итоговая стоимость к оплате (₽)', exact: true })).toHaveValue('10001.20')
  state.failure = null
  await drawer.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(page).toHaveURL(/\/memberships$/)
  expect(state.posts[0].requestId).not.toEqual(state.posts[1].requestId)
  expect(state.receipts).toHaveLength(1)
})

test('membership sale generic 500 explains uncertain outcome and keeps safe retry', async ({ page }) => {
  const state = await setupSale(page)
  const drawer = await fillSale(page)
  state.failure = { status: 500, json: { message: 'Internal server error' } }
  await drawer.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(drawer.getByRole('alert').first()).toContainText('Сервер не смог завершить оформление абонемента.')
  await expect(drawer.getByRole('alert').first()).toContainText('Результат операции пока неизвестен')
  await expect(drawer.getByRole('combobox', { name: 'Услуга', exact: true })).toBeDisabled()
  state.failure = null
  await drawer.getByRole('button', { name: 'Повторить продажу', exact: true }).click()
  await expect(page).toHaveURL(/\/memberships$/)
  expect(state.posts[0].requestId).toEqual(state.posts[1].requestId)
})

test('membership sale with cashbox disabled explains absence of a cash receipt', async ({ page }) => {
  const state = await setupSale(page); state.disabled = true
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'ADMIN', modules: [{ module: 'SCHEDULE', isEnabled: true, accessLevel: 'FULL' }, { module: 'CASHBOX', isEnabled: false, accessLevel: 'FULL' }] } }))
  const drawer = await fillSale(page)
  await expect(drawer.getByText('Касса клуба отключена. Абонемент будет оформлен без кассовой операции.')).toBeVisible()
  await drawer.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(page.getByText('Абонемент оформлен. Касса клуба отключена, приход не создан.')).toBeVisible()
  expect(state.receipts).toHaveLength(0)
})

test('membership sale read-only cash access prevents submission', async ({ page }) => {
  await setupSale(page)
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'ADMIN', modules: [{ module: 'SCHEDULE', isEnabled: true, accessLevel: 'FULL' }, { module: 'CASHBOX', isEnabled: true, accessLevel: 'READ_ONLY' }] } }))
  await page.goto('/memberships/new')
  await expect(page.getByRole('button', { name: 'Создать абонемент', exact: true })).toBeDisabled()
})

test('membership sale handles empty catalogue, error retry and manual lesson count', async ({ page }) => {
  await setupSale(page)
  let error = true
  await page.route('**/api/services?*', route => error ? route.fulfill({ status: 500, json: { message: 'Нет связи' } }) : route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/memberships/new')
  await expect(page.getByText('Не удалось загрузить услуги', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Создать абонемент', exact: true })).toBeDisabled()
  error = false
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  const service = page.getByRole('combobox', { name: 'Услуга', exact: true })
  await service.focus(); await service.press('ArrowDown')
  await expect(page.getByText('Нет услуг для продажи абонемента', { exact: true })).toBeVisible()
  await service.press('Escape')
  await page.getByRole('button', { name: 'Создать абонемент', exact: true }).click()
  await expect(page.getByText('Выберите услугу', { exact: true }).last()).toBeVisible()
  await setupSale(page)
  const drawer = await fillSale(page)
  await drawer.getByRole('spinbutton', { name: 'Количество занятий', exact: true }).fill('5')
  await expect(drawer.getByRole('spinbutton', { name: 'Итоговая стоимость к оплате (₽)', exact: true })).toHaveValue('6250.75')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Закрыть продажу абонемента?', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await expect(drawer.getByRole('spinbutton', { name: 'Количество занятий', exact: true })).toHaveValue('5')
})

test('issue membership opens the existing form with the correct client selected', async ({ page }) => {
  await page.route('**/api/pricing-plans?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/clients')
  await page.getByRole('link', { name: '+ Выдать абонемент' }).click()
  await expect(page).toHaveURL(/\/memberships\/new\?clientId=client-b/)
  await expect(page.locator('.ant-select-selection-item').first()).toHaveText('Борис Иванов · +79991234567')
})

test('client type filter and conversion preserve the client record', async ({ page }) => {
  const id = '00000000-0000-4000-8000-000000000011'
  let clientType = 'ONE_TIME'
  const filters: Array<string | null> = []
  await page.route('**/api/clients?*', route => {
    const type = new URL(route.request().url()).searchParams.get('clientType')
    filters.push(type)
    const rows = !type || type === clientType ? [{ ...client, id, clientType }] : []
    return route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } })
  })
  await page.route(`**/api/clients/${id}/convert-to-regular`, route => {
    expect(route.request().method()).toBe('PATCH')
    clientType = 'REGULAR'
    return route.fulfill({ json: { ...client, id, clientType } })
  })
  await page.goto('/clients')
  await expect(page.getByText('Разовый', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Тип клиента' }).focus()
  await page.getByRole('combobox', { name: 'Тип клиента' }).press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Разовые', { exact: true }).click()
  await expect.poll(() => filters.at(-1)).toBe('ONE_TIME')
  await page.getByRole('button', { name: 'Сделать постоянным', exact: true }).click()
  await expect(page.getByText('Разовый', { exact: true })).not.toBeVisible()
  await page.getByRole('combobox', { name: 'Тип клиента' }).focus()
  await page.getByRole('combobox', { name: 'Тип клиента' }).press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Постоянные', { exact: true }).click()
  await expect.poll(() => filters.at(-1)).toBe('REGULAR')
  await expect(page.getByRole('button', { name: 'Анна Орлова', exact: true })).toBeVisible()
})

test('creates and selects a regular rider with an optional level inside membership sale', async ({ page }) => {
  await page.route('**/api/pricing-plans?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/clients/quick', route => {
    const payload = route.request().postDataJSON()
    posts.push(payload)
    return route.fulfill({ status: 201, json: { id: '00000000-0000-4000-8000-000000000012', ...payload, clientType: 'REGULAR' } })
  })
  await page.goto('/memberships/new')
  await page.getByRole('combobox', { name: 'Клиент', exact: true }).fill('Новый всадник')
  await page.getByRole('button', { name: '+ Постоянный клиент', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Постоянный клиент', exact: true })
  await expect(create.getByRole('textbox', { name: 'ФИО', exact: true })).toHaveValue('Новый всадник')
  await expect(create).not.toHaveClass(/ant-zoom-(enter|appear)/)
  const level = create.getByRole('combobox', { name: /Уровень всадника/ })
  await level.focus(); await level.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Начинающий', { exact: true })).toBeVisible()
  await level.press('Enter')
  await create.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()
  await expect(create).not.toBeVisible()
  await expect(page.locator('.ant-select-selection-item').first()).toContainText('Новый всадник')
  expect(posts).toEqual([{ name: 'Новый всадник', isOneTime: false, riderLevel: 'BEGINNER' }])
})

test('canonical ledger renders a signed decimal deposit charge with a standalone training', async ({ page }) => {
  await page.route('**/api/clients/client-a/membership-ledger?*', route => route.fulfill({ headers: { 'x-total-count': '1' }, json: [{
    id: 'canonical-charge', type: 'DEBIT', amount: 1250.75, signedAmount: '-1250.75', transactionType: 'penalty_cancellation', unit: 'RUB',
    reason: 'Штрафная отмена менее чем за 12 часов', createdAt: '2026-10-09T07:00Z',
    membership: { title: 'Депозит', pricingPlan: null }, lesson: { id: 'standalone', startTime: '2026-10-09T10:00Z', status: 'penalty_cancellation', service: { title: 'Выездка', name: 'Выездка' } },
  }] }))
  await page.goto('/clients'); await page.getByRole('button', { name: 'История баланса', exact: true }).first().click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('−1 250,75 ₽', { exact: true })).toBeVisible()
  await expect(modal.getByText('Штрафная отмена', { exact: true })).toBeVisible()
  await expect(modal.getByText('Депозит', { exact: true })).toBeVisible()
})

for (const width of [1280, 390]) {
  test(`balance, lazy ledger, signed changes and keyboard close at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    let requests = 0
    await page.route('**/api/clients/client-a/membership-ledger?*', async route => {
      requests++
      await route.fulfill({ headers: { 'x-total-count': '2' }, json: [
        { id: 'op1', type: 'DEBIT', amount: 1, reason: 'Занятие завершено', createdAt: '2026-10-08T10:15:00Z',
          lesson: { id: 'lesson', startTime: '2026-10-08T09:00:00Z', status: 'COMPLETED', service: { title: 'Выездка' } }, membership: { pricingPlan: { name: 'Клубный' } } },
        { id: 'op2', type: 'CREDIT', amount: 8, reason: 'Выдача абонемента', createdAt: '2026-10-01T10:00:00Z', lesson: null, membership: { pricingPlan: null } },
      ] })
    })
    await page.goto('/clients')
    await expect(page.getByText('5 / 8', { exact: true })).toBeVisible()
    await expect(page.getByText('Нет активного абонемента')).toBeVisible()
    await expect(page.getByRole('link', { name: '+ Выдать абонемент' })).toHaveAttribute('href', '/memberships/new?clientId=client-b')
    expect(requests).toBe(0)
    const trigger = page.getByRole('button', { name: 'История баланса', exact: true }).first()
    await trigger.click()
    const modal = page.getByRole('dialog')
    await expect(modal.getByText('−1', { exact: true })).toBeVisible()
    await expect(modal.getByText('+8', { exact: true })).toBeVisible()
    await expect(modal.getByText('Списание за тренировку', { exact: true })).toBeVisible()
    await expect(modal.getByText('Выездка', { exact: false })).toBeVisible()
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ant-modal-wrap')))).toBe(true)
    await page.screenshot({ path: `test-results/client-ledger-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('button', { name: 'Редактировать', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Удалить клиента', exact: true }).first()).toBeVisible()
  })
}

test('ledger loading, error recovery, empty state and client switching', async ({ page }) => {
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  let fail = true
  await page.route('**/api/clients/client-a/membership-ledger?*', async route => {
    await gate
    await route.fulfill(fail ? { status: 500, json: { message: 'История временно недоступна' } }
      : { json: [], headers: { 'x-total-count': '0' } })
  })
  await page.route('**/api/clients/client-b/membership-ledger?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/clients')
  await page.getByRole('button', { name: 'История баланса', exact: true }).first().click()
  await expect(page.getByRole('dialog').locator('.ant-spin-spinning')).toBeVisible()
  release?.()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Не удалось загрузить историю баланса')
  fail = false
  await page.getByRole('button', { name: 'Повторить' }).click()
  await expect(page.getByText('Операций по абонементам пока нет')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ant-modal-wrap')))).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'История баланса', exact: true }).nth(1).click()
  await expect(page.getByRole('dialog')).toContainText('Борис Иванов')
  await expect(page.getByText('Операций по абонементам пока нет')).toBeVisible()
})
