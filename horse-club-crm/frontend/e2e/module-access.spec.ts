import { test, expect, type Page } from '@playwright/test'
const modules = ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL']
const roles = ['ADMIN', 'MANAGER', 'TRAINER', 'STABLE_WORKER']
async function setup(page: Page, role = 'ADMIN', readOnlyVeterinary = false) {
  let enabled = true
  let permissions = roles.flatMap(role => modules.map(module => ({ role, module, accessLevel: role === 'ADMIN' || role === 'MANAGER' || module === 'SCHEDULE' && role === 'TRAINER' ? 'FULL' : ['VETERINARY', 'STABLES'].includes(module) ? 'READ_ONLY' : 'HIDDEN' })))
  if (readOnlyVeterinary) permissions = permissions.map(row => row.role === role && row.module === 'VETERINARY' ? { ...row, accessLevel: 'READ_ONLY' } : row)
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', role); localStorage.setItem('horsecrm.email', 'qa@example.com')
  }, role)
  const snapshot = () => ({ modules: modules.map(module => ({ module, isEnabled: module !== 'VETERINARY' || enabled })), permissions })
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role, modules: snapshot().modules.map(row => ({ ...row, accessLevel: permissions.find(p => p.role === role && p.module === row.module)!.accessLevel })) } }))
  await page.route('**/api/settings/modules', route => route.fulfill({ json: snapshot() }))
  await page.route('**/api/settings/modules/toggle', route => { enabled = route.request().postDataJSON().isEnabled; return route.fulfill({ json: {} }) })
  await page.route('**/api/settings/modules/permissions', route => { permissions = route.request().postDataJSON().permissions; return route.fulfill({ json: snapshot() }) })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { userId: 'u', trainerId: null, role,
    permissions: { horseReplaceOwn: true, horseReplaceAny: false, healthRead: true, healthWrite: false, financeRead: false, boardingAccess: true } } }))
  for (const path of ['horses', 'trainers', 'arenas', 'clients', 'services', 'stalls']) await page.route(`**/api/${path}?*`, route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/vet/records*', route => route.fulfill({ status: enabled ? 200 : 403, json: enabled ? { data: [], total: 0 } : { message: 'Модуль временно отключен в настройках клуба' } }))
  await page.route('**/api/vet/summary*', route => route.fulfill({ json: {} }))
}
async function settings(page: Page) {
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Модули и права доступа', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Ветеринарный учет' })).toBeVisible()
}
for (const width of [1280, 375]) test(`toggle veterinary, block direct URL and restore access at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await setup(page); await settings(page)
  const switcher = page.getByRole('switch', { name: 'Ветеринарный учет' })
  await switcher.focus(); await switcher.press('Space')
  await page.getByRole('dialog', { name: 'Отключить модуль?' }).getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(switcher).not.toBeChecked()
  if (width < 1000) await page.getByRole('button', { name: 'Открыть меню навигации' }).click()
  await expect(page.getByRole('link', { name: 'Ветеринарный журнал', exact: true })).toHaveCount(0)
  if (width < 1000) await page.keyboard.press('Escape')
  await page.goto('/vet'); await expect(page.getByText('Раздел недоступен или отключен в настройках клуба')).toBeVisible()
  await page.screenshot({ path: info.outputPath(`blocked-${width}.png`), fullPage: true })
  await settings(page); await switcher.click()
  await page.getByRole('dialog', { name: 'Включить модуль?' }).getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(switcher).toBeChecked()
  await page.goto('/vet'); await expect(page.getByRole('heading', { name: 'Ветеринарный журнал', exact: true })).toBeVisible()
})
test('matrix locks administrator, supports keyboard and persists manager read-only', async ({ page }, info) => {
  await setup(page); await settings(page)
  await page.getByRole('tab', { name: 'Матрица прав ролей' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Администратор: Ветеринарный учет' }).getByRole('radio', { name: 'Полный', exact: true })).toBeDisabled()
  const group = page.getByRole('radiogroup', { name: 'Управляющий: Ветеринарный учет' })
  const selected = group.getByRole('radio', { name: 'Полный', exact: true })
  await selected.focus(); await selected.press('ArrowRight')
  await expect(group.getByRole('radio', { name: 'Просмотр', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click()
  await page.getByRole('dialog', { name: 'Сохранить права ролей?' }).getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Сохранить изменения', exact: true })).toBeDisabled()
  await expect(page.locator('.ant-modal-mask')).toBeHidden()
  await page.screenshot({ path: info.outputPath('matrix.png'), fullPage: true, animations: 'disabled' })
})
test('trainer read-only veterinary has no mutations; hidden cash and payroll block direct links', async ({ page }) => {
  await setup(page, 'TRAINER'); await page.goto('/vet')
  await expect(page.getByRole('heading', { name: 'Ветеринарный журнал', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить ветзапись' })).toHaveCount(0)
  for (const url of ['/cash-desk', '/staff', '/horse-health-logs/new']) {
    await page.goto(url); await expect(page.getByText('Раздел недоступен или отключен в настройках клуба')).toBeVisible()
  }
})
test('failed permission loading is closed and retry restores access', async ({ page }) => {
  await setup(page)
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ status: 503, json: { message: 'Недоступно' } }))
  await page.goto('/vet'); await expect(page.getByText('Не удалось проверить права доступа')).toBeVisible()
  await page.unroute('**/api/settings/my-permissions*')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'ADMIN', modules: modules.map(module => ({ module, isEnabled: true, accessLevel: 'FULL' })) } }))
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ветеринарный журнал', exact: true })).toBeVisible()
})

test('manager read-only veterinary removes editing and settings matrix', async ({ page }) => {
  await setup(page, 'MANAGER', true); await page.goto('/vet')
  await expect(page.getByRole('heading', { name: 'Ветеринарный журнал', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить ветзапись' })).toHaveCount(0)
  await page.goto('/settings')
  await expect(page.getByRole('tab', { name: 'Модули и права доступа', exact: true })).toHaveCount(0)
})

test('failed toggle retains the current flag and confirmation for retry', async ({ page }) => {
  await setup(page); await settings(page)
  await page.route('**/api/settings/modules/toggle', route => route.fulfill({ status: 503, json: { message: 'Настройки временно недоступны' } }))
  await page.getByRole('switch', { name: 'Ветеринарный учет' }).click()
  const dialog = page.getByRole('dialog', { name: 'Отключить модуль?' })
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog.getByText('Настройки временно недоступны')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Ветеринарный учет' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(dialog).not.toBeVisible()
})

test('mobile dark matrix supports keyboard with reduced motion', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 850 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('horsecrm.color_mode', 'dark'))
  await setup(page); await settings(page)
  await page.getByRole('tab', { name: 'Матрица прав ролей' }).click()
  const group = page.getByRole('radiogroup', { name: 'Управляющий: Расписание тренировок' })
  const selected = group.getByRole('radio', { name: 'Полный', exact: true })
  await selected.focus(); await selected.press('ArrowRight')
  await expect(group.getByRole('radio', { name: 'Просмотр', exact: true })).toBeChecked()
  await expect(group).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('matrix-mobile-dark-reduced-motion.png'), animations: 'disabled' })
})
