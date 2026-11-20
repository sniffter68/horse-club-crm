import { test, expect, type Page } from './fixtures'
const horse = { id: '00000000-0000-4000-8000-000000000011', name: 'Буран', sex: 'STALLION', birthYear: 2016, status: 'active', ownerType: 'private',
  feedingNotes: 'Утро: овёс 1 кг\nДень: морковь\nВечер: овёс 1 кг\nСено: 8 кг\nПодкормки: соль',
  owner: { name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567' } }
const mare = { ...horse, id: '00000000-0000-4000-8000-000000000012', name: 'Искра', sex: 'MARE', ownerType: 'club' }
const mainBuilding = '00000000-0000-4000-8000-000000000101'
const summerBuilding = '00000000-0000-4000-8000-000000000102'
const buildings = [
  { id: mainBuilding, name: 'Основная конюшня', order: 0, gridRows: 3, gridCols: 4, aisleCols: [2, 3], total: 2, occupied: 2, available: 0, roomCount: 2 },
  { id: summerBuilding, name: 'Летники', order: 1, gridRows: 3, gridCols: 4, aisleCols: [2, 3], total: 1, occupied: 0, available: 1, roomCount: 1 },
]
const initial = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Денник 1', number: '1', zone: 'MAIN', side: 'LEFT', position: 1, status: 'OCCUPIED', horseId: '00000000-0000-4000-8000-000000000011', horse, notes: 'Двойной слой опилок', warnings: [{ neighborId: '00000000-0000-4000-8000-000000000002', neighborNumber: '2', message: 'Жеребец рядом с кобылой (Буран и Искра)' }] },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Денник 2', number: '2', zone: 'MAIN', side: 'RIGHT', position: 1, status: 'OCCUPIED', horseId: '00000000-0000-4000-8000-000000000012', horse: mare, notes: null, warnings: [] },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Летник 1', number: 'Л-1', zone: 'SUMMER', side: 'LEFT', position: 1, status: 'AVAILABLE', horseId: null, horse: null, notes: null, warnings: [] },
].map(s => ({ ...s, buildingId: s.zone === 'SUMMER' ? summerBuilding : mainBuilding, row: 1, col: s.side === 'RIGHT' ? 4 : 1, rowSpan: 1, colSpan: 1, type: 'STALL' }))
type FixtureStall = Omit<(typeof initial)[number], 'horse' | 'horseId' | 'notes'> & { horse: typeof horse | null; horseId: string | null; notes: string | null; description?: string; contracts?: Array<{ status: string }> }
async function setup(page: Page, role = 'ADMIN', empty = false, readOnly = false) {
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', role); localStorage.setItem('horsecrm.email', 'qa@example.com')
    Object.defineProperty(window, 'print', { value: () => { document.body.dataset.printed = 'true' } })
  }, role)
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { role, userId: '00000000-0000-4000-8000-000000000201', permissions: {
    horseReplaceOwn: true, horseReplaceAny: true, healthRead: true, healthWrite: true, financeRead: true, boardingAccess: true,
  } } }))
  if (readOnly) await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role, modules: [{ module: 'STABLES', isEnabled: true, accessLevel: 'READ_ONLY' }] } }))
  const state = { stalls: empty ? [] : structuredClone(initial) as FixtureStall[], fail: false, assignments: 0 }
  await page.route('**/api/stable-buildings', route => route.fulfill({ json: buildings }))
  await page.route('**/api/stalls/assignment-horses', route => route.fulfill({ json: [horse, mare] }))
  await page.route('**/api/stalls/map', route => state.fail ? route.fulfill({ status: 503, json: { message: 'Сервер временно недоступен' } }) : route.fulfill({ json: state.stalls }))
  await page.route('**/api/stalls/transfer/preview', route => route.fulfill({ json: [
    { stallId: state.stalls[0]?.id, number: '1', warnings: [] },
    { stallId: state.stalls[1]?.id, number: '2', warnings: [{ neighborId: '00000000-0000-4000-8000-000000000202', neighborNumber: '3', message: 'Жеребец рядом с жеребцом (Буран и Кролик)' }] },
  ] }))
  await page.route('**/api/stalls/transfer', route => {
    state.assignments++
    if (state.fail) return route.fulfill({ status: 409, json: { message: 'Размещение изменилось. Обновите карту.' } })
    const { sourceStallId, targetStallId, horseId, swapIfOccupied } = route.request().postDataJSON()
    const source = state.stalls.find(s => s.id === sourceStallId)!, target = state.stalls.find(s => s.id === targetStallId)!
    expect(source.horseId).toBe(horseId)
    expect(swapIfOccupied).toBe(Boolean(target.horse))
    const previous = { horse: source.horse, horseId: source.horseId }
    Object.assign(source, { horse: target.horse, horseId: target.horseId, status: target.horse ? 'OCCUPIED' : 'AVAILABLE' })
    Object.assign(target, previous, { status: 'OCCUPIED' })
    return route.fulfill({ json: state.stalls })
  })
  await page.route('**/api/stalls/*/assign', route => {
    state.assignments++
    if (state.fail) return route.fulfill({ status: 409, json: { message: 'Денник уже занят. Обновите карту.' } })
    const id = route.request().url().split('/').at(-2), { horseId } = route.request().postDataJSON()
    state.stalls = state.stalls.map(s => s.id === id ? { ...s, horseId, horse: horseId === '00000000-0000-4000-8000-000000000011' ? horse : horseId === '00000000-0000-4000-8000-000000000012' ? mare : null, status: horseId ? 'OCCUPIED' : 'AVAILABLE' }
      : s.horseId === horseId && horseId ? { ...s, horseId: null, horse: null, status: 'AVAILABLE' } : s)
    return route.fulfill({ json: state.stalls.find(s => s.id === id) })
  })
  await page.route('**/api/stalls/00000000-0000-4000-8000-000000000003', route => {
    if (state.fail) return route.fulfill({ status: 409, json: { message: 'Изменения не сохранены' } })
    state.stalls[2] = { ...state.stalls[2], ...route.request().postDataJSON() }
    return route.fulfill({ json: state.stalls[2] })
  })
  await page.goto('/stable')
  return state
}

test('constructor moves a pen into the aisle, rejects collisions, retains failed draft and saves spans', async ({ page }) => {
  const state = await setup(page)
  let saves = 0
  await page.route('**/api/stalls/layout', async route => {
    saves++
    if (state.fail) return route.fulfill({ status: 409, json: { message: 'Схема изменилась. Повторите сохранение.' } })
    const blocks = route.request().postDataJSON() as Array<{ id: string; row: number; col: number; rowSpan: number; colSpan: number }>
    for (const b of blocks) Object.assign(state.stalls.find(s => s.id === b.id)!, b)
    return route.fulfill({ json: state.stalls })
  })
  await page.getByRole('switch', { name: 'Режим конструктора' }).click()
  const controls = page.getByLabel('Расположение 1', { exact: true })
  await controls.getByRole('button', { name: 'Вправо', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).locator('..')).toHaveCSS('grid-column-start', '2')
  await page.getByRole('combobox', { name: 'Высота 1', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('2×', { exact: true }).click()
  await controls.getByRole('button', { name: 'Вправо', exact: true }).click()
  await expect(controls.getByRole('button', { name: 'Вправо', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/stall-grid-constructor.png', fullPage: true })
  state.fail = true
  await page.getByRole('button', { name: 'Сохранить схему', exact: true }).click()
  await expect(page.getByText('Схема изменилась. Повторите сохранение.')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Режим конструктора' })).toBeChecked()
  state.fail = false
  await page.getByRole('button', { name: 'Сохранить схему', exact: true }).click()
  await expect(page.getByText('Схема сохранена', { exact: true })).toBeVisible()
  expect(saves).toBe(2); expect(state.stalls[0].col).toBe(3); expect(state.stalls[0].rowSpan).toBe(2)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).locator('..')).toHaveCSS('grid-column-start', '3')
})

test('rename and delete a stall, retaining failed drafts and refreshing the map', async ({ page }) => {
  const state = await setup(page)
  let patches = 0, deletes = 0, rejectDelete = true
  const id = initial[2].id
  await page.route(`**/api/stalls/${id}`, async route => {
    if (route.request().method() === 'DELETE') {
      deletes++
      if (rejectDelete) return route.fulfill({ status: 400, json: { message: 'Нельзя удалить занятый денник. Сначала освободите его или переведите лошадь' } })
      state.stalls = state.stalls.filter(s => s.id !== id)
      return route.fulfill({ json: { id } })
    }
    patches++
    if (state.fail) return route.fulfill({ status: 400, json: { message: 'Изменения не сохранены' } })
    const values = route.request().postDataJSON()
    expect(values.name).toBe('Летний бокс'); expect(values.number).toBe('Л-12')
    Object.assign(state.stalls[2], values)
    return route.fulfill({ json: state.stalls[2] })
  })
  await page.getByRole('button', { name: 'Денник Л-1, Свободен', exact: true }).click()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Летний бокс')
  await page.getByRole('textbox', { name: 'Номер денника', exact: true }).fill('Л-12')
  await page.screenshot({ path: 'test-results/stall-edit-drawer.png', fullPage: true, animations: 'disabled' })
  state.fail = true
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Изменения не сохранены', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Номер денника', exact: true })).toHaveValue('Л-12')
  state.fail = false
  const patched = page.waitForResponse(r => r.url().endsWith(`/stalls/${id}`) && r.request().method() === 'PATCH' && r.status() === 200)
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).not.toHaveClass(/ant-btn-loading/)
  await page.getByRole('button', { name: 'Сохранить', exact: true }).dblclick()
  await patched
  await expect(page.getByRole('button', { name: 'Денник Л-12, Свободен', exact: true })).toContainText('Летний бокс')
  expect(patches).toBe(2)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Денник Л-12, Свободен', exact: true })).toContainText('Летний бокс')
  await page.getByRole('button', { name: 'Денник Л-12, Свободен', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить денник', exact: true }).click()
  await page.getByRole('dialog', { name: 'Удалить денник?' }).getByRole('button', { name: 'Отмена', exact: true }).click()
  expect(deletes).toBe(0)
  await page.getByRole('button', { name: 'Удалить денник', exact: true }).click()
  await page.getByRole('dialog', { name: 'Удалить денник?' }).getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByText('Нельзя удалить занятый денник. Сначала освободите его или переведите лошадь')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Карточка денника' })).toContainText('Л-12')
  rejectDelete = false
  await page.getByRole('button', { name: 'Удалить денник', exact: true }).click()
  const removed = page.waitForResponse(r => r.url().endsWith(`/stalls/${id}`) && r.request().method() === 'DELETE' && r.status() === 200)
  await page.getByRole('dialog', { name: 'Удалить денник?' }).getByRole('button', { name: 'Удалить', exact: true }).dblclick()
  await removed
  await expect(page.getByRole('button', { name: 'Денник Л-12, Свободен', exact: true })).toHaveCount(0)
  await expect(page.getByText('Денник удалён', { exact: true })).toBeVisible()
  expect(deletes).toBe(2)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Денник Л-12, Свободен', exact: true })).toHaveCount(0)
})

test('list edits labels in a drawer using PATCH and deletes without leaving the list', async ({ page }) => {
  const state = await setup(page)
  const id = initial[2].id
  state.stalls = [state.stalls[2]]
  Object.assign(state.stalls[0], { rowSpan: 4, colSpan: 3 })
  await page.route('**/api/stable-buildings', route => route.fulfill({ json: buildings.map(b => ({ ...b, gridRows: 6, gridCols: 6 })) }))
  await page.route('**/api/stalls?*', route => route.fulfill({ json: state.stalls, headers: { 'x-total-count': String(state.stalls.length) } }))
  let patches = 0, deletes = 0
  await page.route(`**/api/stalls/${id}`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state.stalls[0] })
    if (route.request().method() === 'DELETE') {
      deletes++; state.stalls = []; return route.fulfill({ json: { id } })
    }
    expect(route.request().method()).toBe('PATCH')
    patches++
    Object.assign(state.stalls[0], route.request().postDataJSON())
    return route.fulfill({ json: state.stalls[0] })
  })
  await page.goto('/stalls')
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Редактирование денника' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('textbox', { name: 'Название', exact: true }).fill('Северный бокс')
  await drawer.getByRole('textbox', { name: 'Номер денника', exact: true }).fill('С-5')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Северный бокс', exact: true })).toBeVisible()
  expect(patches).toBe(1); expect(state.stalls[0].number).toBe('С-5')
  await page.reload()
  await page.getByRole('button', { name: 'Северный бокс', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка денника' })).toContainText('С-5')
  await page.getByRole('dialog', { name: 'Карточка денника' }).getByRole('button', { name: 'Закрыть шторку', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка денника' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Удалить денник', exact: true }).click()
  await page.getByRole('dialog', { name: 'Удалить денник?' }).getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Северный бокс', exact: true })).toHaveCount(0)
  expect(deletes).toBe(1)
  await expect(page).toHaveURL(/\/stalls(?:\?|$)/)
})

for (const source of ['list', 'map'] as const) for (const occupied of [false, true]) {
  test(`stall card edits details in place and persists after reload: ${source}, occupied=${occupied}`, async ({ page }) => {
    if (source === 'list' && !occupied) await page.setViewportSize({ width: 390, height: 844 })
    const state = await setup(page)
    const room = state.stalls[occupied ? 0 : 2]
    const placement = { horseId: room.horseId, status: room.status, buildingId: room.buildingId }
    let patches = 0, deletes = 0, reject = true
    await page.route('**/api/stalls?*', route => route.fulfill({ json: [room], headers: { 'x-total-count': '1' } }))
    await page.route(`**/api/stalls/${room.id}`, route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: room })
      if (route.request().method() === 'DELETE') { deletes++; state.stalls = state.stalls.filter(s => s.id !== room.id); return route.fulfill({ json: room }) }
      expect(route.request().method()).toBe('PATCH')
      patches++
      const payload = route.request().postDataJSON() as Record<string, unknown>
      expect(payload).not.toHaveProperty('horseId')
      expect(payload).not.toHaveProperty('contracts')
      if (reject) return route.fulfill({ status: 409, json: { message: 'Попробуйте сохранить ещё раз' } })
      Object.assign(room, payload)
      return route.fulfill({ json: room })
    })
    if (source === 'list') await page.goto('/stalls')
    const open = () => source === 'list'
      ? page.getByRole('button', { name: room.name, exact: true }).click()
      : page.getByRole('button', { name: `Денник ${room.number}, ${occupied ? 'Буран' : 'Свободен'}`, exact: true }).click()
    await open()
    const card = page.getByRole('dialog', { name: 'Карточка денника' })
    await expect(card.getByRole('textbox', { name: 'Название', exact: true })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Удалить денник', exact: true })).toHaveCount(occupied ? 0 : 1)
    await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
    await card.getByRole('textbox', { name: 'Название', exact: true }).fill('Обновлённый бокс')
    await card.getByRole('textbox', { name: 'Номер денника', exact: true }).fill('Б-27')
    await card.getByRole('textbox', { name: 'Описание', exact: true }).fill('Светлый бокс\nНовая поилка')
    await card.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(card.getByText('Попробуйте сохранить ещё раз')).toBeVisible()
    await expect(card.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue('Светлый бокс\nНовая поилка')
    reject = false
    const saved = page.waitForResponse(r => r.url().endsWith(`/stalls/${room.id}`) && r.request().method() === 'PATCH' && r.ok())
    await expect(card.getByRole('button', { name: 'Сохранить', exact: true })).not.toHaveClass(/ant-btn-loading/)
    await card.getByRole('button', { name: 'Сохранить', exact: true }).dblclick()
    await saved
    await expect(card.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible()
    await expect(card).toContainText('Обновлённый бокс')
    await expect(card).toContainText('Б-27')
    await expect(card).toContainText('Новая поилка')
    expect(patches).toBe(2)
    expect({ horseId: room.horseId, status: room.status, buildingId: room.buildingId }).toEqual(placement)
    await page.reload()
    await open()
    await expect(card).toContainText('Обновлённый бокс')
    await expect(card).toContainText('Б-27')
    await expect(card).toContainText('Новая поилка')
    await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
    await card.getByRole('textbox', { name: 'Название', exact: true }).fill('Не сохранять')
    await card.getByRole('button', { name: 'Отмена', exact: true }).click()
    await page.getByRole('dialog', { name: 'Закрыть без сохранения?' }).getByRole('button', { name: 'Закрыть', exact: true }).click()
    await expect(card).toContainText('Обновлённый бокс')
    expect(patches).toBe(2)
    if (!occupied) {
      await card.getByRole('button', { name: 'Удалить денник', exact: true }).click()
      await page.getByRole('dialog', { name: 'Удалить денник?' }).getByRole('button', { name: 'Удалить', exact: true }).click()
      await expect(card).toHaveCount(0)
      expect(deletes).toBe(1)
    } else await page.screenshot({ path: `test-results/stall-card-${source}-occupied.png`, animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('stall card hides mutations for READ_ONLY and deletion for a boarding contract without a horse', async ({ page }) => {
  const state = await setup(page, 'MANAGER', false, true)
  await page.getByRole('button', { name: 'Денник Л-1, Свободен', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка денника' })
  await expect(card.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Удалить денник', exact: true })).toHaveCount(0)
  await card.getByRole('button', { name: 'Закрыть шторку' }).click()
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: [{ module: 'STABLES', isEnabled: true, accessLevel: 'FULL' }] } }))
  state.stalls[2].contracts = [{ status: 'ACTIVE' }]
  await page.reload()
  await page.getByRole('button', { name: 'Денник Л-1, Свободен', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Удалить денник', exact: true })).toHaveCount(0)
})

test('stall card changes room type and building, validates and locks a pending save', async ({ page }) => {
  const state = await setup(page)
  const room = state.stalls[2]
  let release = () => {}
  const pending = new Promise<void>(resolve => { release = resolve })
  let patches = 0
  await page.route(`**/api/stalls/${room.id}`, async route => {
    patches++
    await pending
    const payload = route.request().postDataJSON() as Record<string, unknown>
    expect(payload.type).toBe('SERVICE'); expect(payload.number).toBe(''); expect(payload.buildingId).toBe(mainBuilding)
    Object.assign(room, payload)
    await route.fulfill({ json: room })
  })
  await page.getByRole('button', { name: 'Денник Л-1, Свободен', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка денника' })
  await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await card.getByRole('textbox', { name: 'Номер денника', exact: true }).fill(' ')
  await card.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(card.getByText('Укажите номер денника')).toBeVisible()
  expect(patches).toBe(0)
  await card.getByRole('combobox', { name: 'Тип помещения', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Служебное помещение', { exact: true }).click()
  await card.getByRole('textbox', { name: 'Название', exact: true }).fill('Склад сена')
  await card.getByRole('combobox', { name: 'Корпус', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Основная конюшня', { exact: true }).click()
  await page.screenshot({ path: 'test-results/stall-card-service-edit.png', animations: 'disabled' })
  const requested = page.waitForRequest(r => r.url().endsWith(`/stalls/${room.id}`) && r.method() === 'PATCH')
  await card.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await requested
  await expect(card.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()
  await expect(card.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled()
  await expect(card.getByRole('textbox', { name: 'Название', exact: true })).toBeDisabled()
  const saved = page.waitForResponse(r => r.url().endsWith(`/stalls/${room.id}`) && r.ok())
  release()
  await saved
  await expect(card.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible()
  await expect(card).toContainText('Склад сена')
  await expect(card).toContainText('Служебное помещение')
  expect(patches).toBe(1)
  await page.reload()
  await page.getByRole('button', { name: 'Склад сена, служебное', exact: true }).click()
  await expect(card).toContainText('Склад сена')
  await expect(card).not.toContainText('Номер денника')
})

test('building settings create, rename and delete an empty building with recoverable errors', async ({ page }) => {
  await setup(page)
  const data = structuredClone(buildings)
  let fail = true
  await page.route('**/api/stable-buildings', async route => {
    if (route.request().method() === 'POST') {
      if (fail) return route.fulfill({ status: 400, json: { message: 'Корпус с таким названием уже существует' } })
      const b = { ...route.request().postDataJSON(), id: '00000000-0000-4000-8000-000000000199', total: 0, occupied: 0, available: 0, roomCount: 0 }
      data.push(b); return route.fulfill({ json: b })
    }
    return route.fulfill({ json: data })
  })
  await page.route('**/api/stable-buildings/*', async route => {
    const id = route.request().url().split('/').at(-1)
    if (route.request().method() === 'DELETE') { data.splice(data.findIndex(b => b.id === id), 1); return route.fulfill({ json: { id } }) }
    const b = data.find(b => b.id === id)!; Object.assign(b, route.request().postDataJSON()); return route.fulfill({ json: b })
  })
  await page.getByRole('button', { name: 'Настроить корпуса', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Удалить Основная конюшня', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Создать корпус', exact: true }).click()
  await page.getByRole('textbox', { name: 'Название корпуса', exact: true }).fill('Новый корпус')
  await page.getByRole('button', { name: 'Сохранить корпус', exact: true }).click()
  await expect(page.getByText('Корпус с таким названием уже существует')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Название корпуса', exact: true })).toHaveValue('Новый корпус')
  fail = false
  await page.getByRole('button', { name: 'Сохранить корпус', exact: true }).click()
  await expect(page.getByRole('tab', { name: /Новый корпус/ })).toBeVisible()
  await page.getByRole('button', { name: 'Изменить Новый корпус', exact: true }).click()
  await page.getByRole('textbox', { name: 'Название корпуса', exact: true }).fill('Пони')
  await page.getByRole('button', { name: 'Сохранить корпус', exact: true }).click()
  await expect(page.getByRole('tab', { name: /Пони/ })).toBeVisible()
  await page.getByRole('button', { name: 'Удалить Пони', exact: true }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByRole('tab', { name: /Пони/ })).toHaveCount(0)
})

test('service card is neutral and read-only access hides constructor and building mutations', async ({ page }) => {
  const state = await setup(page, 'MANAGER', false, true)
  Object.assign(state.stalls[2], { type: 'SERVICE', name: 'Амуничник', number: '' })
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  const card = page.getByRole('button', { name: 'Амуничник, служебное' })
  await expect(card).toContainText('Служебное')
  await expect(card).not.toContainText('№'); await expect(card).not.toContainText('Свободен'); await expect(card).not.toContainText('—')
  await expect(page.getByRole('switch', { name: 'Режим конструктора' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Настроить корпуса', exact: true })).toHaveCount(0)
})

test('empty aisle slot creates a service room without a number', async ({ page }) => {
  const state = await setup(page)
  await page.route('**/api/stalls', async route => {
    const values = route.request().postDataJSON()
    expect(values.type).toBe('SERVICE'); expect(values.number).toBe(''); expect(values.col).toBe(2)
    const room = { ...state.stalls[0], ...values, id: '00000000-0000-4000-8000-000000000099', horse: null, horseId: null, status: 'AVAILABLE', warnings: [] }
    state.stalls.push(room); return route.fulfill({ json: room })
  })
  await page.getByRole('switch', { name: 'Режим конструктора' }).click()
  await page.getByRole('button', { name: 'Поместить сюда: ряд 1, колонка 2, Основная конюшня', exact: true }).click()
  await page.getByRole('combobox', { name: 'Тип помещения', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Служебное помещение', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Туалет')
  await page.getByRole('button', { name: 'Создать помещение', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Туалет, служебное', exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Режим конструктора' })).not.toBeChecked()
})

test('drag moves into an aisle and cancelling a dirty layout requires confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setup(page)
  await page.getByRole('switch', { name: 'Режим конструктора' }).click()
  const tile = page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).locator('..')
  await tile.dragTo(page.getByRole('button', { name: 'Поместить сюда: ряд 1, колонка 2, Основная конюшня', exact: true }))
  await expect(tile).toHaveCSS('grid-column-start', '2')
  await page.getByRole('switch', { name: 'Режим конструктора' }).click()
  await expect(page.getByRole('dialog')).toContainText('Отменить изменения схемы?')
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await expect(tile).toHaveCSS('grid-column-start', '2')
  await page.getByRole('switch', { name: 'Режим конструктора' }).click()
  await page.getByRole('button', { name: 'Отменить изменения', exact: true }).click()
  await expect(tile).toHaveCSS('grid-column-start', '1')
})
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
test('read-only manager can read rations and print but cannot mutate', async ({ page }) => {
  await setup(page, 'MANAGER', false, true)
  await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Рацион кормления' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить денник' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Удалить денник', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Убрать лошадь из денника' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Перевести в денник', exact: true })).toHaveCount(0)
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
  await setup(page, 'MANAGER', false, true)
  const tile = page.getByRole('button', { name: 'Денник 1, Буран', exact: true })
  await tile.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть шторку', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile).toBeFocused()
  await page.getByRole('tab', { name: /Летники/ }).click()
  await expect(tile).toHaveCount(0)
  await expect(page).toHaveURL(/buildingId=/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/stall-map-mobile.png', fullPage: true })
})
test('status and notes save, and unavailable stalls cannot be populated', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Денник Л-1, Свободен' }).click()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await page.getByRole('combobox', { name: 'Статус денника' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown').getByText('На ремонте', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Заметки для конюха' }).fill('Починить поилку')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Лошадь для заселения' })).toBeDisabled()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
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

for (const swap of [false, true]) {
  test(`quick transfer ${swap ? 'swaps occupants' : 'moves into empty stall'} with preview and recoverable failure`, async ({ page }) => {
    if (!swap) await page.setViewportSize({ width: 390, height: 844 })
    const state = await setup(page)
    await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
    await page.getByRole('button', { name: 'Перевести в денник', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Перевести в денник', exact: true })
    await expect(dialog.getByRole('button', { name: 'Подтвердить' })).toBeDisabled()
    await dialog.getByRole('combobox', { name: 'Целевой денник' }).focus()
    await page.keyboard.press('ArrowDown')
    const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    await expect(options.first()).toContainText('Свободен')
    await options.filter({ hasText: swap ? 'Рокировка с Искра' : 'Свободен' }).click()
    await expect(dialog.getByText('Риск соседства после перемещения')).toBeVisible()
    await expect(dialog.getByText(/Жеребец рядом с жеребцом/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Подтвердить' })).toBeEnabled()
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
    await page.screenshot({ path: `test-results/stall-transfer-${swap ? 'swap' : 'mobile'}.png`, fullPage: true })
    state.fail = true
    await dialog.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(dialog.getByText('Размещение изменилось. Обновите карту.')).toBeVisible()
    state.fail = false
    await dialog.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(page.getByRole('button', { name: swap ? 'Денник 2, Буран' : 'Денник Л-1, Буран', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: swap ? 'Денник 1, Искра' : 'Денник 1, Свободен', exact: true })).toBeVisible()
    expect(state.assignments).toBe(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('preview failure can be retried and Escape restores transfer opener focus', async ({ page }) => {
  await setup(page)
  let failPreview = true
  await page.route('**/api/stalls/transfer/preview', route => failPreview
    ? route.fulfill({ status: 503, json: { message: 'Проверка временно недоступна' } })
    : route.fulfill({ json: [] }))
  await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
  const opener = page.getByRole('button', { name: 'Перевести в денник', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Перевести в денник', exact: true })
  await dialog.getByRole('combobox', { name: 'Целевой денник' }).click()
  await page.locator('.ant-select-dropdown:visible').getByText(/Свободен/).click()
  await expect(dialog.getByText('Проверка временно недоступна')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Подтвердить' })).toBeDisabled()
  failPreview = false
  await dialog.getByRole('button', { name: 'Повторить проверку' }).click()
  await expect(dialog.getByRole('button', { name: 'Подтвердить' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Отмена' }).focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('manager with READ_ONLY stables cannot transfer', async ({ page }) => {
  await setup(page, 'MANAGER')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules:
    ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: 'READ_ONLY' })) } }))
  await page.reload()
  await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Перевести в денник', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Сохранить денник' })).toHaveCount(0)
})


for (const mode of ['immediate', 'layout', 'stall'] as const) {
  const immediate = mode !== 'layout', service = mode !== 'stall'
  test(`constructor edits room parameters and persists after reload (${mode})`, async ({ page }) => {
    if (!immediate) await page.setViewportSize({ width: 390, height: 844 })
    const state = await setup(page)
    let saves = 0
    await page.route('**/api/stalls/layout', route => {
      saves++
      if (state.fail) return route.fulfill({ status: 409, json: { message: 'Схема изменена, повторите сохранение' } })
      const blocks: Array<Partial<FixtureStall> & { id: string }> = route.request().postDataJSON()
      for (const block of blocks) Object.assign(state.stalls.find(s => s.id === block.id)!, block)
      return route.fulfill({ json: state.stalls })
    })
    await page.getByRole('switch', { name: 'Режим конструктора' }).click()
    await page.getByRole('button', { name: 'Денник Л-1, Свободен', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Параметры помещения', exact: true })
    await drawer.getByRole('textbox', { name: 'Название', exact: true }).fill('Мойка')
    await drawer.getByRole('textbox', { name: 'Номер денника', exact: true }).fill('М-7')
    await drawer.getByRole('combobox', { name: 'Корпус', exact: true }).focus()
    await page.keyboard.press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible').getByText('Основная конюшня', { exact: true }).click()
    await drawer.getByRole('spinbutton', { name: 'Ряд', exact: true }).fill('2')
    await drawer.getByRole('spinbutton', { name: 'Колонка', exact: true }).fill('2')
    await drawer.getByRole('spinbutton', { name: 'Высота в ячейках', exact: true }).fill('2')
    await drawer.getByRole('spinbutton', { name: 'Ширина в ячейках', exact: true }).fill('2')
    if (service) {
      await drawer.getByRole('combobox', { name: 'Тип помещения', exact: true }).focus()
      await page.keyboard.press('ArrowDown')
      await page.locator('.ant-select-dropdown:visible').getByText('Служебное помещение', { exact: true }).click()
    }
    if (immediate) {
      state.fail = true
      await drawer.getByRole('button', { name: 'Сохранить изменения', exact: true }).click()
      await expect(drawer.getByText('Схема изменена, повторите сохранение', { exact: true })).toBeVisible()
      await expect(drawer.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('Мойка')
      state.fail = false
      await drawer.getByRole('button', { name: 'Сохранить изменения', exact: true }).click()
      await expect(page.getByRole('switch', { name: 'Режим конструктора' })).toBeChecked()
    } else {
      await drawer.getByRole('button', { name: 'Применить к схеме', exact: true }).click()
      expect(saves).toBe(0)
      await expect(page.getByRole('button', { name: 'Мойка, служебное', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Сохранить схему', exact: true }).click()
    }
    await expect(drawer).toHaveCount(0)
    expect(state.stalls[2]).toMatchObject({ name: 'Мойка', number: service ? '' : 'М-7', type: service ? 'SERVICE' : 'STALL', buildingId: mainBuilding, row: 2, col: 2, rowSpan: 2, colSpan: 2 })
    await page.reload()
    const room = page.getByRole('button', { name: service ? 'Мойка, служебное' : 'Денник М-7, Свободен', exact: true })
    await expect(room).toBeVisible()
    if (service) { await expect(room).not.toContainText('№'); await expect(room).not.toContainText('—') }
    await expect(room.locator('..')).toHaveCSS('grid-row-start', '2')
    await page.getByRole('switch', { name: 'Режим конструктора' }).click()
    await room.click()
    await expect(drawer.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('Мойка')
    await expect(drawer.getByRole('spinbutton', { name: 'Высота в ячейках', exact: true })).toHaveValue('2')
    await expect.poll(async () => { const box = await drawer.boundingBox(); return box !== null && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width + 1 }).toBe(true)
    await page.screenshot({ path: `test-results/constructor-room-${mode}.png`, fullPage: true, animations: 'disabled' })
  })
}
