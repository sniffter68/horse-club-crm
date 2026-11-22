import { test, expect } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const trainerId = '22222222-2222-4222-8222-222222222222'
const bookingId = '33333333-3333-4333-8333-333333333333'
const horseId = '44444444-4444-4444-8444-444444444444'
const day = '2026-11-23'

for (const surface of ['web', 'telegram'] as const) for (const width of [390, 1440]) test(`${surface} ${width}: card details, reschedule conflict/retry and cancellation`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await page.clock.setFixedTime(new Date(`${day}T06:00:00Z`))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'TRAINER')
    localStorage.setItem('horsecrm.email', 'trainer@test')
    window.Telegram = { WebApp: { initData: 'signed-test', ready() {}, expand() {}, onEvent() {}, offEvent() {} } }
  })
  let status = 'SCHEDULED', start = `${day}T07:00:00Z`, fail = true, moves = 0, cancellations = 0
  const booking = { id: bookingId, clientConfirmed: true, client: { id: bookingId, name: 'Анна Всадник' }, horse: { id: horseId, name: 'Гром' } }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path.endsWith('/bootstrap')) return route.fulfill({ json: { role: 'TRAINER', token: 'trainer-memory-session', trainerId, user: { id, name: 'Мария Тренер' }, accessLevel: 'FULL' } })
    if (path.endsWith('/quick-booking/permissions')) return route.fulfill({ json: { lessonCreateOwn: false, lessonCreateAny: false } })
    if (path.endsWith('/trainer-board')) return route.fulfill({ json: { date: day, trainerId, trainers: [{ id: trainerId, name: 'Мария Тренер' }], horses: [], openTime: '09:00', closeTime: '15:00',
      lessons: [{ id, trainerId, startTime: start, endTime: `${day}T12:45:00+03:00`, status, trainer: { id: trainerId, name: 'Мария Тренер' }, arena: null, trainerNote: null, isOwn: true, canManage: true, bookings: [booking] }] } })
    if (path.endsWith('/schedule')) return route.fulfill({ json: url.searchParams.get('date') === day ? [{ id, startTime: start, endTime: `${day}T12:45:00+03:00`, status,
      clientName: 'Анна Всадник', serviceName: 'Выездка 45 минут', horseId, horseName: 'Гром', notes: null, participants: [{ bookingId, clientName: 'Анна Всадник', horseId, horseName: 'Гром' }] }] : [] })
    if (path.endsWith('/management-details')) return route.fulfill({ json: { id, startTime: start, endTime: `${day}T12:45:00+03:00`, trainerId, status,
      serviceName: 'Выездка 45 минут', canReplaceHorse: true, trainers: [{ id: trainerId, name: 'Мария Тренер' }], horses: [{ id: horseId, name: 'Гром' }],
      bookings: [{ id: bookingId, clientName: 'Анна Всадник', phone: '+79991234567', horseId, horseName: 'Гром', payment: 'Абонемент' }] } })
    if (path.endsWith('/reschedule-slots')) return route.fulfill({ json: { slots: [{ startTime: '11:00', available: false, reason: 'Лошади требуется отдых' }, { startTime: '12:00', available: true }] } })
    if (path.endsWith('/scheduled-reschedule') || path.endsWith('/reschedule')) {
      moves++
      expect(route.request().postDataJSON()).toMatchObject({ date: day, startTime: '12:00', trainerId })
      if (fail) return route.fulfill({ status: 409, json: { message: 'Лошадь занята. Выберите другое время' } })
      start = `${day}T12:00:00+03:00`
      return route.fulfill({ json: { id, startTime: start } })
    }
    if (path.endsWith('/scheduled-cancel') || path.endsWith('/status')) {
      cancellations++
      expect(route.request().postDataJSON()).toEqual({ status: 'CANCELLED', reason: 'Погодные условия: Сильный дождь' })
      status = 'CANCELLED'
      return route.fulfill({ json: { id, status } })
    }
    return route.fallback()
  })
  await page.goto(surface === 'web' ? '/trainer' : '/tma/trainer')
  const card = page.getByRole('button', { name: /^Занятие 10:00/ })
  await card.focus(); await page.keyboard.press('Enter')
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Выездка 45 минут')).toBeVisible()
  await expect(drawer.getByRole('link', { name: '+79991234567' })).toHaveAttribute('href', 'tel:+79991234567')
  await drawer.getByRole('button', { name: 'Перенести', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(card).toBeFocused()
  await card.click()
  await drawer.getByRole('button', { name: 'Перенести', exact: true }).click()
  await drawer.getByLabel('Тренер', { exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'Мария Тренер' })).toBeVisible()
  await page.getByRole('option', { name: 'Мария Тренер' }).click()
  await expect(drawer.getByRole('button', { name: '11:00 · занято' })).toBeDisabled()
  await drawer.getByRole('button', { name: '12:00', exact: true }).click()
  await drawer.getByRole('button', { name: 'Подтвердить перенос' }).click()
  await expect(drawer.getByRole('alert')).toContainText('Лошадь занята')
  await expect(drawer.getByRole('button', { name: '12:00', exact: true })).toHaveAttribute('aria-pressed', 'true')
  fail = false
  await drawer.getByRole('button', { name: 'Подтвердить перенос' }).click()
  await expect(drawer).toHaveCount(0)
  await expect(page.getByText('Занятие перенесено', { exact: true })).toBeVisible()
  expect(moves).toBe(2)
  await page.getByRole('button', { name: /^Занятие 12:00/ }).click()
  await drawer.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(drawer.getByRole('button', { name: 'Подтвердить отмену' })).toBeDisabled()
  await drawer.getByRole('button', { name: 'Погодные условия', exact: true }).click()
  await drawer.getByLabel('Комментарий').fill('Сильный дождь')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/lesson-cancel-${surface}-${width}.png`, fullPage: true })
  await drawer.getByRole('button', { name: 'Подтвердить отмену' }).click()
  await expect(drawer).toHaveCount(0)
  expect(cancellations).toBe(1)
  await expect(page.getByText('Отменено', { exact: true })).toBeVisible()
})
