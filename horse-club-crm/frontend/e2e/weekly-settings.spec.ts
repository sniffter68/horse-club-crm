import { test, expect, type Page } from './fixtures'

const weekDays = Array.from({ length: 7 }, (_, index) => ({ dayOfWeek: index + 1, isWorkingDay: index !== 6, openTime: '09:00', closeTime: '21:00' }))

async function setup(page: Page, role = 'ADMIN') {
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', role)
    localStorage.setItem('horsecrm.email', 'settings@example.com')
  }, role)
  await page.route('**/api/**', route => {
    if (/\/settings\/(access\/me|my-permissions)|\/cashbox\/summary|\/leads\/events/.test(route.request().url())) return route.fallback()
    return route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
  })
}

for (const width of [390, 1440]) test(`weekly schedule preserves holidays and saves seven days at ${width}px`, async ({ page }, testInfo) => {
  await setup(page)
  await page.addInitScript(mode => localStorage.setItem('horsecrm.color_mode', mode), width === 1440 ? 'dark' : 'light')
  await page.setViewportSize({ width, height: 960 })
  let saved = { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [0], weekDays: structuredClone(weekDays) }
  let fail = true
  let patches = 0
  await page.route('**/api/settings/club-schedule', async route => {
    if (route.request().method() === 'PATCH') {
      patches++
      if (fail) { fail = false; return route.fulfill({ status: 500, json: { message: 'Не удалось сохранить график' } }) }
      const body = route.request().postDataJSON() as { weekDays: typeof weekDays }
      expect(body.weekDays).toHaveLength(7)
      saved = { ...saved, ...body }
    }
    await route.fulfill({ json: saved })
  })
  await page.goto('/settings?tab=schedule')
  const monday = page.getByTestId('schedule-day-1')
  await expect(monday.getByRole('switch')).toBeChecked()
  await expect(page.getByTestId('schedule-day-7').getByRole('switch')).not.toBeChecked()
  await expect(page.getByLabel('Воскресенье: открытие', { exact: true })).toHaveCount(0)
  await monday.getByRole('switch').focus()
  await page.keyboard.press('Space')
  await expect(monday.getByText('Выходной', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Понедельник: открытие', { exact: true })).toHaveCount(0)
  await monday.getByRole('switch').click()
  const opening = page.getByLabel('Понедельник: открытие', { exact: true })
  await opening.fill('10:30'); await opening.press('Enter'); await opening.press('Tab')
  await monday.getByRole('button', { name: 'Применить ко всем рабочим дням' }).click()
  await expect(page.getByLabel('Вторник: открытие', { exact: true })).toHaveValue('10:30')
  await page.getByTestId('schedule-day-6').getByRole('switch').click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Не удалось сохранить график', { exact: true })).toBeVisible()
  await expect(opening).toHaveValue('10:30')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('График работы сохранён', { exact: true })).toBeVisible()
  expect(patches).toBe(2)
  expect(saved.weekDays[5].isWorkingDay).toBe(false)
  expect(saved.weekDays[6].openTime).toBe('09:00')
  await page.reload()
  await expect(page.getByLabel('Понедельник: открытие', { exact: true })).toHaveValue('10:30')
  await expect(page.getByTestId('schedule-day-6').getByRole('switch')).not.toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath(`weekly-schedule-${width}.png`), fullPage: true })
})

test('notification toggles reveal recipients, validate, and preserve false on save', async ({ page }, testInfo) => {
  await setup(page)
  let saved = { clientReminder24h: true, clientReminder2h: false, trainerNewBooking: true, trainerCancellation: true,
    adminDigest: false, adminDigestTime: '20:00', adminRecipientIds: [] as string[] }
  await page.route('**/api/settings/notifications', async route => {
    if (route.request().method() === 'PATCH') saved = { ...saved, ...route.request().postDataJSON() as typeof saved }
    await route.fulfill({ json: saved })
  })
  await page.route('**/api/settings/notification-recipients', route => route.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.com' }] }))
  await page.goto('/settings?tab=notifications')
  await page.getByRole('switch', { name: 'Напоминание клиенту за 24 часа', exact: true }).click()
  await page.getByRole('switch', { name: 'Ежедневная сводка администратору', exact: true }).click()
  await expect(page.getByLabel('Время отправки', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Выберите хотя бы одного администратора', { exact: true })).toBeVisible()
  await page.getByLabel('Получатели сводки', { exact: true }).click()
  await page.getByTitle('admin@example.com', { exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Настройки уведомлений сохранены', { exact: true })).toBeVisible()
  expect(saved.clientReminder24h).toBe(false)
  expect(saved.adminDigest).toBe(true)
  expect(saved.adminRecipientIds).toHaveLength(1)
  await page.screenshot({ path: testInfo.outputPath('club-notifications.png'), fullPage: true })
})

test('read-only settings disable switches and hide save', async ({ page }) => {
  await setup(page, 'MANAGER')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: [
    { module: 'SCHEDULE', isEnabled: true, accessLevel: 'READ_ONLY' },
  ] } }))
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [0], weekDays } }))
  await page.goto('/settings?tab=schedule')
  await expect(page.getByTestId('schedule-day-1').getByRole('switch')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0)
})

test('closed day notice links to the weekly schedule settings', async ({ page }) => {
  await setup(page)
  await page.clock.setFixedTime(new Date('2026-11-29T09:00:00Z'))
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [0], weekDays } }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } }))
  await page.goto('/schedule')
  await expect(page.getByText('Клуб не работает в этот день', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Настроить график работы', exact: true }).click()
  await expect(page).toHaveURL(/\/settings\?tab=schedule$/)
  await expect(page.getByRole('switch', { name: 'Воскресенье', exact: true })).not.toBeChecked()
})

test('all holidays retain saved hours after an unfinished time edit', async ({ page }) => {
  await setup(page)
  let saved = { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [0], weekDays: structuredClone(weekDays) }
  await page.route('**/api/settings/club-schedule', async route => {
    if (route.request().method() === 'PATCH') saved = { ...saved, ...route.request().postDataJSON() as typeof saved }
    await route.fulfill({ json: saved })
  })
  await page.goto('/settings?tab=schedule')
  const closing = page.getByLabel('Понедельник: закрытие', { exact: true })
  await closing.fill('09:00'); await closing.press('Enter'); await closing.press('Tab')
  for (let day = 1; day <= 7; day++) {
    const control = page.getByTestId(`schedule-day-${day}`).getByRole('switch')
    if (await control.isChecked()) await control.click()
  }
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('График работы сохранён', { exact: true })).toBeVisible()
  expect(saved.weekDays.every(day => !day.isWorkingDay)).toBe(true)
  expect(saved.weekDays[0].closeTime).toBe('21:00')
})
