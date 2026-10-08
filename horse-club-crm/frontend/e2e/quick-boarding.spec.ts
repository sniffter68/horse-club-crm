import { test, expect, type Locator, type Page } from '@playwright/test'
test.use({ timezoneId: 'America/New_York' })

const horse = { id: 'h1', name: 'Кролик', breed: '', riderLevel: '', maxDailyMinutes: 240, minRestMinutes: 15, isUnavailable: false }
const stall = { id: 's1', name: 'Денник №1', description: '', isUnavailable: false, createdAt: '2026-01-01T00:00:00Z' }
const client = { id: 'c1', name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567' }
const contract = { id: 'bc1', status: 'ACTIVE', startsAt: '2026-01-01T09:00:00Z', endsAt: null,
  monthlyRate: 25000, horse, stall, client, payments: [{ id: 'p1', amount: 25000, status: 'PENDING' }] }
const available = { horses: [{ id: 'h1', name: 'Кролик' }, { id: 'h2', name: 'Валдай' }],
  stalls: [{ id: 's1', name: 'Денник №1' }, { id: 's2', name: 'Денник №2' }] }

async function setup(page: Page, { occupied = false, unavailable = false, role = 'ADMIN' } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-08T09:00:00Z'))
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', role)
  }, role)
  const state = { occupied, posts: [] as Record<string, unknown>[], released: 0, horseReads: 0, stallReads: 0 }
  const horseDetails = () => ({ ...horse, healthLogs: [], bookings: [], boardingContracts: state.occupied ? [contract] : [], currentBoardingContract: state.occupied ? contract : null })
  const stallDetails = () => ({ ...stall, isUnavailable: unavailable, contracts: state.occupied ? [contract] : [] })
  await page.route('**/api/horses?*', route => route.fulfill({ json: [horse], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/stalls?*', route => route.fulfill({ json: [stallDetails()], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/horses/h1', route => { state.horseReads++; return route.fulfill({ json: horseDetails() }) })
  await page.route('**/api/stalls/s1', route => { state.stallReads++; return route.fulfill({ json: stallDetails() }) })
  await page.route('**/api/clients?*', route => route.fulfill({ json: [client], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/boarding-contracts/availability?*', route => route.fulfill({ json: available }))
  await page.route('**/api/boarding-contracts', async route => {
    state.posts.push(route.request().postDataJSON()); state.occupied = true
    await route.fulfill({ json: contract })
  })
  await page.route('**/api/boarding-contracts/bc1/terminate', async route => {
    state.released++; state.occupied = false
    await route.fulfill({ json: { ...contract, status: 'TERMINATED', endsAt: '2026-10-08T09:00:00Z' } })
  })
  return state
}

async function openCard(page: Page, kind: 'horse' | 'stall') {
  await page.goto(kind === 'horse' ? '/horses' : '/stalls')
  await page.getByRole('button', { name: kind === 'horse' ? horse.name : stall.name, exact: true }).click()
  return page.getByRole('dialog', { name: kind === 'horse' ? 'Карточка лошади' : 'Карточка денника', exact: true })
}
async function select(page: Page, modal: Locator, name: string, label: string) {
  const combobox = page.getByRole('combobox', { name, exact: true })
  await expect(modal.getByRole('combobox', { name, exact: true })).toBeEnabled()
  await modal.locator('.ant-select-selector').filter({ has: combobox }).click()
  await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
}

for (const width of [1280, 320]) test(`horse placement and confirmed release update the open card at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const state = await setup(page)
  const card = await openCard(page, 'horse')
  await card.getByRole('button', { name: '+ Разместить в денник', exact: true }).click()
  const modal = page.getByRole('dialog', { name: `Быстрое заселение · ${horse.name}`, exact: true })
  await expect(modal.getByRole('combobox', { name: 'Лошадь', exact: true })).toBeDisabled()
  await expect(modal.getByLabel('Дата начала', { exact: true })).toHaveValue('08.10.2026 12:00')
  await select(page, modal, 'Денник', 'Денник №1')
  await select(page, modal, 'Владелец / клиент', 'Анна Орлова')
  await modal.getByRole('spinbutton', { name: 'Стоимость в месяц, ₽' }).fill('25000')
  await page.screenshot({ path: `test-results/quick-boarding-${width}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await modal.getByRole('button', { name: 'Заселить', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await expect(card.getByRole('button', { name: 'Освободить денник', exact: true })).toBeVisible()
  expect(state.horseReads).toBeGreaterThan(1)
  expect(state.posts).toEqual([{ horseId: 'h1', stallId: 's1', clientId: 'c1', status: 'ACTIVE', monthlyRate: 25000, startsAt: '2026-10-08T09:00:00.000Z' }])
  await card.getByRole('button', { name: 'Освободить денник', exact: true }).click()
  const release = page.getByRole('dialog', { name: 'Освободить денник?', exact: true })
  await release.getByRole('button', { name: 'Оставить', exact: true }).click()
  expect(state.released).toBe(0)
  await card.getByRole('button', { name: 'Освободить денник', exact: true }).click()
  await release.getByRole('button', { name: 'Освободить', exact: true }).click()
  await expect(card.getByRole('button', { name: '+ Разместить в денник', exact: true })).toBeVisible()
  expect(state.released).toBe(1)
  await card.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible()
})

test('stall preselection, search and keyboard cancellation preserve the underlying card', async ({ page }) => {
  const state = await setup(page)
  const card = await openCard(page, 'stall')
  const trigger = card.getByRole('button', { name: '+ Заселить лошадь', exact: true })
  await trigger.click()
  const modal = page.getByRole('dialog', { name: `Быстрое заселение · ${stall.name}`, exact: true })
  await expect(modal.getByRole('combobox', { name: 'Денник', exact: true })).toBeDisabled()
  await modal.getByRole('combobox', { name: 'Лошадь', exact: true }).click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await select(page, modal, 'Владелец / клиент', 'Анна Орлова')
  await expect(modal.getByRole('button', { name: 'Подтвердить', exact: true })).toBeEnabled()
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(card).toBeVisible()
  await expect(trigger).toBeFocused()
  expect(state.posts).toHaveLength(0)
  await trigger.click()
  await select(page, modal, 'Лошадь', 'Валдай')
  await select(page, modal, 'Владелец / клиент', 'Анна Орлова')
  await modal.getByRole('button', { name: 'Подтвердить', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Освободить денник', exact: true })).toBeVisible()
  expect(state.posts[0]).toMatchObject({ horseId: 'h2', stallId: 's1', monthlyRate: 0 })
})

test('loading, API retry and empty availability keep placement disabled', async ({ page }) => {
  await setup(page)
  let release: (() => void) | undefined, fail = true
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/boarding-contracts/availability?*', async route => {
    await gate
    await route.fulfill(fail ? { status: 503, json: { message: 'Сервис временно недоступен' } } : { json: { horses: available.horses, stalls: [] } })
  })
  const card = await openCard(page, 'horse')
  await card.getByRole('button', { name: '+ Разместить в денник', exact: true }).click()
  const modal = page.getByRole('dialog', { name: `Быстрое заселение · ${horse.name}`, exact: true })
  await expect(modal.locator('.ant-skeleton')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Заселить', exact: true })).toBeDisabled()
  release?.()
  await expect(modal.getByRole('alert')).toContainText('Сервис временно недоступен')
  fail = false
  await modal.getByRole('button', { name: 'Повторить загрузку' }).click()
  await expect(modal.getByText('Свободных денников на этот период нет')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Заселить', exact: true })).toBeDisabled()
})

test('409 preserves client and rate, refreshes availability and permits selecting another stall', async ({ page }) => {
  const state = await setup(page)
  let fail = true
  await page.route('**/api/boarding-contracts', async route => {
    if (fail) { fail = false; await route.fulfill({ status: 409, json: { message: 'Денник уже занят на выбранный период' } }) }
    else { state.posts.push(route.request().postDataJSON()); state.occupied = true; await route.fulfill({ json: contract }) }
  })
  await page.route('**/api/boarding-contracts/availability?*', route => route.fulfill({ json: fail ? available : { ...available, stalls: [available.stalls[1]] } }))
  const card = await openCard(page, 'horse')
  await card.getByRole('button', { name: '+ Разместить в денник', exact: true }).click()
  const modal = page.getByRole('dialog', { name: `Быстрое заселение · ${horse.name}`, exact: true })
  await select(page, modal, 'Денник', 'Денник №1')
  await select(page, modal, 'Владелец / клиент', 'Анна Орлова')
  await modal.getByRole('spinbutton', { name: 'Стоимость в месяц, ₽' }).fill('12345')
  await modal.getByRole('button', { name: 'Заселить', exact: true }).click()
  await expect(modal.getByText('Денник уже занят на выбранный период', { exact: true })).toBeVisible()
  await expect(modal.getByRole('spinbutton', { name: 'Стоимость в месяц, ₽' })).toHaveValue('12345.00')
  await expect(modal.getByRole('button', { name: 'Заселить', exact: true })).toBeDisabled()
  await select(page, modal, 'Денник', 'Денник №2')
  await modal.getByRole('button', { name: 'Заселить', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(state.posts[0]).toMatchObject({ stallId: 's2', clientId: 'c1', monthlyRate: 12345 })
})

test('failed release retains occupied state and confirmation for retry, even for an unavailable stall', async ({ page }) => {
  const state = await setup(page, { occupied: true, unavailable: true })
  let fail = true
  await page.route('**/api/boarding-contracts/bc1/terminate', async route => {
    if (fail) { fail = false; await route.fulfill({ status: 503, json: { message: 'Повторите позже' } }) }
    else { state.occupied = false; state.released++; await route.fulfill({ json: { ...contract, status: 'TERMINATED' } }) }
  })
  const card = await openCard(page, 'stall')
  await card.getByRole('button', { name: 'Освободить денник', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Освободить денник?', exact: true })
  await modal.getByRole('button', { name: 'Освободить', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('Повторите позже')
  expect(state.occupied).toBe(true)
  await modal.getByRole('button', { name: 'Освободить', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await expect(card.getByText('Денник свободен', { exact: true })).toBeVisible()
  expect(state.stallReads).toBeGreaterThan(1)
})

test('TRAINER sees both cards without placement or release actions', async ({ page }) => {
  await setup(page, { role: 'TRAINER' })
  for (const kind of ['horse', 'stall'] as const) {
    const card = await openCard(page, kind)
    await expect(card.getByRole('button', { name: /Разместить|Заселить|Освободить/ })).toHaveCount(0)
    await card.getByRole('button', { name: 'Close', exact: true }).click()
  }
})

test('unavailable free stall cannot be populated', async ({ page }) => {
  await setup(page, { unavailable: true })
  const card = await openCard(page, 'stall')
  await expect(card.getByText('Заселение недоступно: денник закрыт.')).toBeVisible()
  await expect(card.getByRole('button', { name: '+ Заселить лошадь', exact: true })).toHaveCount(0)
})

test('date changes refresh availability in club timezone and the mobile calendar remains within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await setup(page)
  const dates: string[] = []
  await page.route('**/api/boarding-contracts/availability?*', route => {
    const start = new URL(route.request().url()).searchParams.get('startsAt') || ''
    dates.push(start)
    return route.fulfill({ json: start.startsWith('2026-10-09') ? { ...available, stalls: [available.stalls[1]] } : available })
  })
  const card = await openCard(page, 'horse')
  await card.getByRole('button', { name: '+ Разместить в денник', exact: true }).click()
  const modal = page.getByRole('dialog', { name: `Быстрое заселение · ${horse.name}`, exact: true })
  await select(page, modal, 'Денник', 'Денник №1')
  const date = modal.getByLabel('Дата начала', { exact: true })
  await date.click()
  const popup = page.locator('.ant-picker-dropdown:visible')
  await expect(popup).toBeVisible()
  await expect.poll(async () => {
    const bounds = await popup.boundingBox()
    return Boolean(bounds && bounds.width > 200 && bounds.height > 200 && bounds.x >= 0 && bounds.x + bounds.width <= 321)
  }).toBeTruthy()
  await page.screenshot({ path: 'test-results/quick-boarding-date-320.png', fullPage: true, animations: 'disabled' })
  await date.fill('09.10.2026 12:00')
  await date.press('Enter')
  await expect.poll(() => dates.at(-1)).toBe('2026-10-09T09:00:00.000Z')
  await expect(modal.getByText('Выбранная лошадь или денник уже заняты на этот период. Выберите другой вариант или дату.')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Заселить', exact: true })).toBeDisabled()
})
