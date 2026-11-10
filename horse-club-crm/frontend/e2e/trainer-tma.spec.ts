import { test, expect, type Page } from '@playwright/test'
import type { TrainerLesson } from '../src/tma/api'
import type { TelegramWebApp } from '../src/tma/useTelegramWebApp'

const lessonId = '11111111-1111-4111-8111-111111111111'
const bookingId = '22222222-2222-4222-8222-222222222222'
const horseId = '33333333-3333-4333-8333-333333333333'
const today = '2026-11-11'

async function telegram(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-11T07:00:00Z'))
  await page.addInitScript(() => {
    const app: TelegramWebApp = {
      initData: 'signed-test-init-data', colorScheme: 'light',
      themeParams: { bg_color: '#f7f4f0', secondary_bg_color: '#ffffff', text_color: '#3a2f2b', button_color: '#724c39' },
      ready: () => document.documentElement.setAttribute('data-tg-ready', 'true'),
      expand: () => document.documentElement.setAttribute('data-tg-expanded', 'true'),
      onEvent: (_event, callback) => window.addEventListener('trainer-theme', callback),
      offEvent: (_event, callback) => window.removeEventListener('trainer-theme', callback),
    }
    window.Telegram = { WebApp: app }
    // An unrelated CRM session must neither be used nor overwritten.
    localStorage.setItem('horsecrm.access_token', 'crm-untouched')
  })
}

async function mock(page: Page, options: { admin?: boolean; noTrainer?: boolean; readOnly?: boolean; unlinked?: boolean; authFailure?: boolean; scheduleFailure?: boolean; empty?: boolean } = {}) {
  let status: TrainerLesson['status'] = 'SCHEDULED', horse = 'Гром', failMutation = false, mutations = 0, expire = false
  const bodies: unknown[] = []
  const lesson = (): TrainerLesson => ({ id: lessonId, startTime: `${today}T07:00:00Z`, endTime: `${today}T07:45:00Z`,
    status, trainerName: 'Мария Тренер', serviceName: 'Занятие 45 мин', clientName: 'Анна Всадник', horseId: null, horseName: horse, notes: null,
    participants: [{ bookingId, clientName: 'Анна Всадник', horseId: null, horseName: horse }] })
  await page.route('**/api/tma/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/bootstrap')) {
      expect(route.request().postDataJSON()).toEqual({ initData: 'signed-test-init-data' })
      if (options.authFailure) return route.fulfill({ status: 401, json: { message: 'Подпись недействительна' } })
      return route.fulfill({ json: options.unlinked ? { role: 'CLIENT', token: null, user: { telegramId: '123', firstName: 'Анна' } } : {
        role: options.admin ? 'ADMIN' : 'TRAINER', token: 'trainer-memory-session', trainerId: options.noTrainer ? null : bookingId, user: { id: lessonId, name: 'Мария Тренер' }, accessLevel: options.readOnly ? 'READ_ONLY' : 'FULL',
        trainer: { trainerId: bookingId, name: 'Мария Тренер' },
      } })
    }
    expect(route.request().headers().authorization).toBe('Bearer trainer-memory-session')
    if (expire) return route.fulfill({ status: 401, json: { message: 'Сессия истекла' } })
    if (path.endsWith('/schedule')) {
      if (options.scheduleFailure) return route.fulfill({ status: 503, json: { message: 'Нет соединения с сервером' } })
      return route.fulfill({ json: !options.empty && new URL(route.request().url()).searchParams.get('date') === today ? [lesson()] : [] })
    }
    if (path.endsWith('/horses')) return route.fulfill({ json: [{ id: horseId, name: 'Буян' }] })
    mutations++; bodies.push(route.request().postDataJSON())
    if (failMutation) return route.fulfill({ status: 409, json: { message: 'Лошадь занята. Выберите другую' } })
    if (path.endsWith('/status')) status = route.request().postDataJSON().status as TrainerLesson['status']
    if (path.endsWith('/horse')) horse = 'Буян'
    return route.fulfill({ json: { updated: true } })
  })
  return { bodies, mutations: () => mutations, fail: (value: boolean) => { failMutation = value }, expire: () => { expire = true } }
}

test('mobile schedule initializes Telegram, isolates CRM, uses Moscow time, completes and navigates weeks', async ({ page }) => {
  await telegram(page)
  const api = await mock(page)
  await page.goto('/tma/trainer')
  await expect(page.getByRole('heading', { name: 'Мария Тренер' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-tg-ready', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-tg-expanded', 'true')
  await expect(page.getByText('10:00 – 10:45')).toBeVisible()
  await expect(page.locator('.ant-layout-sider')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'среда, 11 ноября, занятий: 1' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Проведено', exact: true }).click()
  await expect(page.getByText('Проведено', { exact: true })).toBeVisible()
  expect(api.mutations()).toBe(1)
  expect(api.bodies).toEqual([{ status: 'COMPLETED' }])
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBe('crm-untouched')
  await page.getByRole('button', { name: 'Следующая неделя' }).click()
  await expect(page.getByText('На этот день занятий нет')).toBeVisible()
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
  await expect(page.getByText('10:00 – 10:45')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '../test-results/tma-mobile.png', fullPage: true })
})

test('horse sheet preserves selection on conflict, recovers, supports keyboard and restores focus', async ({ page }) => {
  await telegram(page)
  const api = await mock(page)
  await page.goto('/tma/trainer')
  const open = page.getByRole('button', { name: 'Сменить лошадь', exact: true })
  await open.click()
  const drawer = page.getByRole('dialog')
  await page.getByLabel('Лошадь', { exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByRole('option', { name: 'Буян' }).click()
  await page.screenshot({ path: '../test-results/tma-horse-sheet.png', fullPage: true })
  api.fail(true)
  await drawer.getByRole('button', { name: 'Сохранить' }).click()
  await expect(drawer.getByText('Лошадь занята. Выберите другую')).toBeVisible()
  await expect(drawer.getByText('Буян', { exact: true })).toBeVisible()
  api.fail(false)
  await drawer.getByRole('button', { name: 'Сохранить' }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.trainer-horse').getByText('Буян')).toBeVisible()
  expect(api.bodies[1]).toEqual({ horseId, bookingId })
  await open.click()
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Закрыть', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(drawer).not.toBeVisible()
  await expect(open).toBeFocused()
})

for (const status of ['NO_SHOW', 'CANCELLED'] as const) test(`reason sheet submits ${status}`, async ({ page }) => {
  await telegram(page)
  const api = await mock(page)
  await page.goto('/tma/trainer')
  await page.getByRole('button', { name: 'Неявка / Отмена', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  if (status === 'CANCELLED') {
    await page.getByLabel('Новый статус', { exact: true }).focus()
    await page.keyboard.press('ArrowDown')
    await page.getByRole('option', { name: 'Отмена', exact: true }).click()
    await expect(drawer.getByText('Для отмены оплаченного занятия обратитесь к администратору.')).toBeVisible()
  }
  await page.getByLabel('Причина', { exact: true }).fill('Клиент предупредил тренера')
  await drawer.getByRole('button', { name: 'Сохранить' }).click()
  await expect(drawer).not.toBeVisible()
  expect(api.bodies[0]).toEqual({ status, reason: 'Клиент предупредил тренера' })
  await expect(page.getByText(status === 'CANCELLED' ? 'Отменено' : 'Неявка', { exact: true })).toBeVisible()
})

test('READ_ONLY, dark theme and 320px layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await telegram(page)
  await mock(page, { readOnly: true })
  await page.goto('/tma/trainer')
  await expect(page.getByText('10:00 – 10:45')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Проведено', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Сменить лошадь', exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    const app = window.Telegram!.WebApp!
    app.colorScheme = 'dark'
    app.themeParams = { bg_color: '#181311', text_color: '#faf7f2', secondary_bg_color: '#241e1c' }
    window.dispatchEvent(new Event('trainer-theme'))
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('main').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(24, 19, 17)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '../test-results/tma-mobile-dark.png', fullPage: true })
})

for (const scenario of ['unlinked', 'authFailure', 'scheduleFailure', 'empty'] as const) test(`handles ${scenario}`, async ({ page }) => {
  await telegram(page)
  const options = { [scenario]: true }
  await mock(page, options)
  await page.goto('/tma/trainer')
  await expect(page.getByText({ unlinked: 'Telegram пока не привязан', authFailure: 'Подпись недействительна',
    scheduleFailure: 'Расписание не загрузилось', empty: 'На этот день занятий нет' }[scenario], { exact: true })).toBeVisible()
  if (scenario === 'scheduleFailure') {
    options.scheduleFailure = false
    await page.getByRole('button', { name: 'Повторить', exact: true }).click()
    await expect(page.getByText('10:00 – 10:45')).toBeVisible()
  }
})

test('session expiry locks screen and never redirects into CRM login', async ({ page }) => {
  await telegram(page)
  const api = await mock(page)
  await page.goto('/tma/trainer')
  await expect(page.getByText('10:00 – 10:45')).toBeVisible()
  api.expire()
  await page.getByRole('button', { name: 'Обновить расписание' }).click()
  await expect(page.getByText('Сессия истекла. Откройте приложение заново через бота')).toBeVisible()
  await expect(page).toHaveURL(/\/tma\/trainer$/)
})

for (const noTrainer of [false, true]) test(`root gateway opens admin schedule; trainer binding absent=${noTrainer}`, async ({ page }) => {
  await telegram(page)
  const paths: string[] = []
  page.on('request', request => { if (request.url().includes('/api/tma/')) paths.push(new URL(request.url()).pathname) })
  await mock(page, { admin: true, noTrainer })
  await page.goto('/tma')
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  expect(paths).toContain('/api/tma/admin/schedule')
  await page.screenshot({ path: `../test-results/gateway-admin-${noTrainer ? 'standalone' : 'trainer'}.png`, fullPage: true })
  await expect(page.locator('.ant-layout-sider')).toHaveCount(0)
  if (noTrainer) await expect(page.getByRole('button', { name: 'Вид тренера', exact: true })).toHaveCount(0)
  else {
    await page.getByRole('button', { name: 'Вид тренера', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Моё расписание' })).toBeVisible()
    expect(paths).toContain('/api/tma/schedule')
    await page.getByRole('button', { name: 'Вид администратора', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  }
})

test('root gateway shows loading before mounting a trainer and recovers from bootstrap failure', async ({ page }) => {
  await telegram(page)
  let release: () => void = () => {}
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/tma/bootstrap', async route => {
    await pending
    await route.fulfill({ status: 503, json: { message: 'Нет соединения с сервером' } })
  })
  await page.goto('/tma')
  await expect(page.getByRole('status').getByText('Проверяем доступ…')).toBeVisible()
  await expect(page.locator('.ant-layout-sider')).toHaveCount(0)
  release()
  await expect(page.getByText('Нет соединения с сервером', { exact: true })).toBeVisible()
  await page.unroute('**/api/tma/bootstrap')
  await mock(page)
  await page.getByRole('button', { name: 'Повторить вход' }).click()
  await expect(page.getByRole('heading', { name: 'Моё расписание' })).toBeVisible()
})

test('root gateway sends clients to the isolated client entry preserving Telegram launch parameters', async ({ page }) => {
  await telegram(page)
  await mock(page, { unlinked: true })
  await page.route('**/tma/client?**', route => route.fulfill({ contentType: 'text/html', body: '<html lang="ru"><head><meta charset="utf-8"></head><body><h1>Запись в клуб</h1></body></html>' }))
  await page.goto('/tma?tgWebAppVersion=8.0#tgWebAppData=signed-launch')
  await expect(page).toHaveURL(/\/tma\/client\?tgWebAppVersion=8.0#tgWebAppData=signed-launch$/)
  await expect(page.getByRole('heading', { name: 'Запись в клуб' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBe('crm-untouched')
})
