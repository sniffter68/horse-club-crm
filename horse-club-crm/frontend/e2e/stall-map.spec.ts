import { test, expect, type Page } from './fixtures'
const horse = { id: 'h1', name: 'Буран', sex: 'STALLION', birthYear: 2016, status: 'active', ownerType: 'private',
  feedingNotes: 'Утро: овёс 1 кг\nДень: морковь\nВечер: овёс 1 кг\nСено: 8 кг\nПодкормки: соль',
  owner: { name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567' } }
const mare = { ...horse, id: 'h2', name: 'Искра', sex: 'MARE', ownerType: 'club' }
const initial = [
  { id: 's1', name: 'Денник 1', number: '1', zone: 'MAIN', side: 'LEFT', position: 1, status: 'OCCUPIED', horseId: 'h1', horse, notes: 'Двойной слой опилок', warnings: [{ neighborId: 's2', neighborNumber: '2', message: 'Жеребец рядом с кобылой (Буран и Искра)' }] },
  { id: 's2', name: 'Денник 2', number: '2', zone: 'MAIN', side: 'RIGHT', position: 1, status: 'OCCUPIED', horseId: 'h2', horse: mare, notes: null, warnings: [] },
  { id: 's3', name: 'Летник 1', number: 'Л-1', zone: 'SUMMER', side: 'LEFT', position: 1, status: 'AVAILABLE', horseId: null, horse: null, notes: null, warnings: [] },
]
async function setup(page: Page, role = 'ADMIN', empty = false) {
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', role); localStorage.setItem('horsecrm.email', 'qa@example.com')
    Object.defineProperty(window, 'print', { value: () => { document.body.dataset.printed = 'true' } })
  }, role)
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { role, userId: 'u1', permissions: {
    horseReplaceOwn: true, horseReplaceAny: true, healthRead: true, healthWrite: true, financeRead: true, boardingAccess: true,
  } } }))
  const state = { stalls: empty ? [] : structuredClone(initial), fail: false, assignments: 0 }
  await page.route('**/api/stalls/assignment-horses', route => route.fulfill({ json: [horse, mare] }))
  await page.route('**/api/stalls/map', route => state.fail ? route.fulfill({ status: 503, json: { message: 'Сервер временно недоступен' } }) : route.fulfill({ json: state.stalls }))
  await page.route('**/api/stalls/*/assign', route => {
    state.assignments++
    if (state.fail) return route.fulfill({ status: 409, json: { message: 'Денник уже занят. Обновите карту.' } })
    const id = route.request().url().split('/').at(-2), { horseId } = route.request().postDataJSON()
    state.stalls = state.stalls.map(s => s.id === id ? { ...s, horseId, horse: horseId === 'h1' ? horse : horseId === 'h2' ? mare : null, status: horseId ? 'OCCUPIED' : 'AVAILABLE' }
      : s.horseId === horseId && horseId ? { ...s, horseId: null, horse: null, status: 'AVAILABLE' } : s)
    return route.fulfill({ json: state.stalls.find(s => s.id === id) })
  })
  await page.route('**/api/stalls/s3', route => {
    if (state.fail) return route.fulfill({ status: 409, json: { message: 'Изменения не сохранены' } })
    state.stalls[2] = { ...state.stalls[2], ...route.request().postDataJSON() }
    return route.fulfill({ json: state.stalls[2] })
  })
  await page.goto('/stable')
  return state
}
test('map shows both rows, warnings, sign and isolated print layout', async ({ page }) => {
  await setup(page)
  await expect(page.getByRole('heading', { name: 'Карта денников' })).toBeVisible()
  await expect(page.getByText('Риск соседства', { exact: true })).toBeVisible()
  await page.getByText('Риск соседства', { exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveText('Жеребец рядом с кобылой (Буран и Искра)')
  await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Жеребец рядом с кобылой (Буран и Искра)')
  await page.getByRole('button', { name: 'Печать таблички на денник' }).click()
  const sign = page.getByRole('article', { name: 'Табличка на денник' })
  await expect(sign.getByRole('heading', { name: 'Буран' })).toBeVisible()
  for (const text of ['2016 г. р.', 'Анна Орлова', '+79991234567', 'овёс 1 кг', 'Сено: 8 кг', 'Двойной слой опилок'])
    await expect(sign.getByText(text, { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Печать', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true')
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#root')).toBeHidden()
  await expect(sign).toBeVisible()
  await page.screenshot({ path: 'test-results/stall-sign.png', fullPage: true })
})
test('risk tooltip explains opposite stallions and quarantine on keyboard focus', async ({ page }) => {
  const state = await setup(page)
  const reason = 'Нежелательное соседство: жеребец напротив жеребца (Буран и Гром)'
  state.stalls[0].warnings[0].message = reason
  state.stalls[2].status = 'QUARANTINE'
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).focus()
  await expect(page.getByRole('tooltip')).toHaveText(reason)
  await page.getByRole('button', { name: 'Денник Л-1, Карантин', exact: true }).focus()
  await expect(page.getByRole('tooltip', { name: 'Карантинная зона', exact: true })).toBeVisible()
})

test('manager relocates a horse and the previous stall becomes free', async ({ page }) => {
  const state = await setup(page, 'MANAGER')
  await page.getByRole('button', { name: 'Денник Л-1, Свободен' }).click()
  await page.getByRole('combobox', { name: 'Лошадь для заселения' }).click()
  await page.getByText('Буран · переселить из 1', { exact: true }).click()
  await page.getByRole('button', { name: 'Заселить лошадь' }).click()
  await expect(page.getByRole('button', { name: 'Денник Л-1, Буран' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Денник 1, Свободен', exact: true })).toBeVisible()
  expect(state.assignments).toBe(1)
})
test('trainer can read rations and print but cannot mutate', async ({ page }) => {
  await setup(page, 'TRAINER')
  await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Рацион кормления' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить денник' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Убрать лошадь из денника' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Печать таблички на денник' }).click()
  await expect(page.getByRole('article')).toBeVisible()
})
test('failed assignment retains selection and shows a recoverable error', async ({ page }) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'Денник Л-1, Свободен' }).click()
  await page.getByRole('combobox', { name: 'Лошадь для заселения' }).click()
  await page.getByText('Буран · переселить из 1', { exact: true }).click()
  state.fail = true
  await page.getByRole('button', { name: 'Заселить лошадь' }).click()
  await expect(page.getByText('Денник уже занят. Обновите карту.')).toBeVisible()
  state.fail = false
  await page.getByRole('button', { name: 'Заселить лошадь' }).click()
  await expect(page.getByRole('button', { name: 'Денник Л-1, Буран' })).toBeVisible()
})
test('narrow layout, building filter, keyboard selection and focus restoration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, 'TRAINER')
  const tile = page.getByRole('button', { name: 'Денник 1, Буран', exact: true })
  await tile.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile).toBeFocused()
  await page.getByRole('combobox', { name: 'Корпус' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown').getByText('Летники', { exact: true }).click()
  await expect(tile).toHaveCount(0)
  await expect(page).toHaveURL(/zone=SUMMER/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/stall-map-mobile.png', fullPage: true })
})
test('status and notes save, and unavailable stalls cannot be populated', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Денник Л-1, Свободен' }).click()
  await page.getByRole('combobox', { name: 'Статус денника' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown').getByText('На ремонте', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Заметки для конюха' }).fill('Починить поилку')
  await page.getByRole('button', { name: 'Сохранить денник' }).click()
  await page.getByRole('button', { name: 'Денник Л-1, На ремонте' }).click()
  await expect(page.getByRole('combobox', { name: 'Лошадь для заселения' })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'Заметки для конюха' })).toHaveValue('Починить поилку')
})
test('empty map and fetch error offer clear feedback and retry', async ({ page }) => {
  const state = await setup(page, 'ADMIN', true)
  await expect(page.getByText('Денников в этом корпусе пока нет')).toBeVisible()
  state.fail = true
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect(page.getByText('Не удалось загрузить карту')).toBeVisible()
  state.fail = false
  await page.getByRole('button', { name: 'Повторить' }).click()
  await expect(page.getByText('Денников в этом корпусе пока нет')).toBeVisible()
})
