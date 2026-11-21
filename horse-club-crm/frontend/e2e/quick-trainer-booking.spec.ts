import { test, expect, type Page } from './fixtures'
import type { QuickContext } from '../src/pages/workspace/quickTrainerBooking'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const trainer = id(1), other = id(2), client = id(3), horse = id(4), service = id(5), arena = id(6)
const context: QuickContext = {
  permissions: { lessonCreateOwn: true, lessonCreateAny: false }, openTime: '09:00', closeTime: '20:00', daysOfWeekOff: [],
  trainers: [{ id: trainer, name: 'Мария' }, { id: other, name: 'Ольга' }],
  services: [{ id: service, name: 'Индивидуальная тренировка', durationMinutes: 60, allowMembership: true }],
  arenas: [{ id: arena, name: 'Манеж' }], entries: [],
  horses: [{ id: horse, name: 'Гром', status: 'active', healthStatus: 'HEALTHY', isUnavailable: false, usedMinutes: 30, maxDailyMinutes: 120 },
    { id: id(7), name: 'Буран', status: 'active', healthStatus: 'TREATMENT', isUnavailable: false, usedMinutes: 0, maxDailyMinutes: 120 },
    { id: id(8), name: 'Ветер', status: 'active', healthStatus: 'QUARANTINE', isUnavailable: false, usedMinutes: 0, maxDailyMinutes: 120 }],
}

async function setup(page: Page, tma: boolean, any = false, readOnly = false) {
  await page.clock.setFixedTime(new Date('2026-11-22T05:00:00Z'))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'TRAINER'); localStorage.setItem('horsecrm.email', 'qa@test.local')
    window.Telegram = { WebApp: { initData: 'signed', colorScheme: 'light', themeParams: {}, ready() {}, expand() {}, onEvent() {}, offEvent() {} } }
  })
  const bodies: Record<string, unknown>[] = []
  let reads = 0, fail = false, quickClients = 0
  const permissions = { lessonCreateOwn: true, lessonCreateAny: any }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path.endsWith('/bootstrap')) return route.fulfill({ json: { role: 'TRAINER', token: 'tma-session', trainerId: trainer, user: { id: trainer, name: 'Мария' }, accessLevel: readOnly ? 'READ_ONLY' : 'FULL' } })
    if (path.includes('/tma/')) expect(route.request().headers().authorization).toBe('Bearer tma-session')
    if (path.endsWith('/access/me')) return route.fulfill({ json: { role: 'TRAINER', trainerId: trainer, userId: trainer, permissions } })
    if (path.endsWith('/my-permissions')) return route.fulfill({ json: { role: 'TRAINER', modules: [{ module: 'SCHEDULE', isEnabled: true, accessLevel: readOnly ? 'READ_ONLY' : 'FULL' }] } })
    if (path.endsWith('/permissions')) return route.fulfill({ json: permissions })
    if (path.endsWith('/context')) return route.fulfill({ json: { ...context, permissions } })
    if (path.endsWith('/clients/quick')) { quickClients++; expect(route.request().postDataJSON()).toEqual({ name: 'Новый всадник', phone: '+79991234567' }); return route.fulfill({ json: { id: client, name: 'Новый всадник', phone: '+79991234567' } }) }
    if (path.endsWith('/clients')) return route.fulfill({ json: [{ id: client, name: 'Анна', phone: '+79990000000' }] })
    if (path.endsWith('/lessons') && route.request().method() === 'POST') {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>)
      return route.fulfill(fail ? { status: 409, json: { message: 'Лошадь занята. Выберите другую' } } : { json: { id: id(9) } })
    }
    if (path.endsWith('/trainer-board')) { reads++; return route.fulfill({ json: { trainerId: trainer, trainers: context.trainers, lessons: [], openTime: '09:00', closeTime: '20:00' } }) }
    if (path.endsWith('/schedule')) { reads++; return route.fulfill({ json: [] }) }
    return route.fulfill({ json: [] })
  })
  await page.goto(tma ? '/tma/trainer' : '/trainer')
  return { bodies, reads: () => reads, quickClients: () => quickClients, fail: (value: boolean) => { fail = value } }
}

for (const width of [390, 1440]) for (const tma of [false, true]) test(`four steps, quick client, horse and automatic defaults ${tma ? 'TMA' : 'web'} ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  const api = await setup(page, tma)
  await page.getByRole('button', { name: tma ? '+ Записать клиента' : '+ Записать', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Записать клиента' })
  await expect(sheet.getByRole('heading', { name: 'Дата', exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Завтра', exact: true }).click()
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click()
  await sheet.getByRole('button', { name: '10:00', exact: true }).click()
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click()
  await expect(sheet.getByLabel('Имя или телефон')).toBeFocused()
  await sheet.getByRole('button', { name: '+ Новый клиент', exact: true }).click()
  await sheet.getByLabel('Имя', { exact: true }).fill('Новый всадник')
  await sheet.getByLabel('Телефон', { exact: true }).fill('+79991234567')
  await sheet.getByRole('button', { name: 'Создать и выбрать' }).click()
  await expect(sheet.getByRole('heading', { name: 'Лошадь', exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Буран/ })).toBeDisabled()
  await expect(sheet.getByRole('button', { name: /Ветер/ })).toBeDisabled()
  await sheet.getByRole('button', { name: /Гром/ }).click()
  await expect(sheet.getByRole('button', { name: 'Создать занятие' })).toBeEnabled()
  const reads = api.reads()
  await page.screenshot({ path: `test-results/quick-trainer-${tma ? 'tma' : 'web'}-${width}.png`, fullPage: true, animations: 'disabled' })
  await sheet.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Запись создана', { exact: true })).toBeVisible()
  await expect.poll(api.reads).toBeGreaterThan(reads)
  expect(api.quickClients()).toBe(1)
  expect(api.bodies).toEqual([{ trainerId: trainer, clientId: client, horseId: horse, serviceId: service, durationMinutes: 60, arenaId: arena, startTime: '2026-11-23T10:00:00+03:00' }])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('other trainer, existing client, retry preserves selection and no horse', async ({ page }) => {
  const api = await setup(page, true, true)
  await page.getByRole('button', { name: '+ Записать клиента', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Записать клиента' })
  await sheet.getByRole('button', { name: 'Ольга', exact: true }).click()
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click()
  await sheet.getByRole('button', { name: '11:00', exact: true }).click()
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click()
  await sheet.getByLabel('Имя или телефон').fill('Анна')
  await sheet.getByRole('button', { name: /Анна.*79990000000/ }).click()
  await sheet.getByRole('button', { name: 'Без лошади (назначить позже)' }).click()
  api.fail(true)
  await sheet.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(sheet.getByRole('alert')).toContainText('Лошадь занята')
  await expect(sheet.getByRole('button', { name: 'Без лошади (назначить позже)' })).toHaveAttribute('aria-pressed', 'true')
  api.fail(false)
  await sheet.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(sheet).toBeHidden()
  expect(api.bodies).toHaveLength(2)
  expect(api.bodies[1]).toMatchObject({ trainerId: other, clientId: client, serviceId: service })
  expect(api.bodies[1]).not.toHaveProperty('horseId')
})

for (const tma of [false, true]) test(`READ_ONLY hides booking ${tma ? 'TMA' : 'web'}`, async ({ page }) => {
  await setup(page, tma, false, true)
  await expect(page.getByRole('heading', { name: tma ? 'Мария' : /Расписание клуба/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Записать/ })).toHaveCount(0)
})

test('grid tap preserves time, fixes own trainer, blocks busy horse and omits occupied arena', async ({ page }) => {
  const api = await setup(page, false)
  await page.route('**/api/workspace/quick-booking/context?*', route => route.fulfill({ json: { ...context, entries: [{ trainerId: other, arenaId: arena, horseIds: [horse], startTime: '2026-11-22T10:00:00+03:00', endTime: '2026-11-22T11:00:00+03:00' }] } }))
  await page.getByRole('button', { name: 'Записать Ольга 10:00', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Записать клиента' })
  await expect(sheet.getByRole('group', { name: 'Тренер' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click()
  await expect(sheet.getByRole('button', { name: '10:00', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click()
  await sheet.getByRole('button', { name: /Анна.*79990000000/ }).click()
  await expect(sheet.getByRole('button', { name: /Гром/ })).toBeDisabled()
  await sheet.getByRole('button', { name: 'Без лошади (назначить позже)' }).click()
  await sheet.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(sheet).toBeHidden()
  expect(api.bodies[0]).toMatchObject({ trainerId: trainer, startTime: '2026-11-22T10:00:00+03:00' })
  expect(api.bodies[0]).not.toHaveProperty('arenaId')
})

test('context failure has retry, and closing restores focus', async ({ page }) => {
  await setup(page, true)
  let fail = true
  await page.route('**/api/tma/quick-booking/context?*', route => route.fulfill(fail ? { status: 503, json: { message: 'Нет соединения' } } : { json: context }))
  const trigger = page.getByRole('button', { name: '+ Записать клиента', exact: true })
  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Записать клиента' })
  await expect(sheet.getByRole('alert')).toContainText('Нет соединения')
  await expect(sheet.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled()
  fail = false
  await sheet.getByRole('button', { name: 'Повторить' }).click()
  await expect(sheet.getByRole('button', { name: 'Далее', exact: true })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(trigger).toBeFocused()
})
