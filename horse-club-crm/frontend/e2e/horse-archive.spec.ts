import { test, expect } from './fixtures'

const id = '00000000-0000-4000-8000-000000000091'

for (const width of [1280, 390]) test(`horse archive preserves history and filters at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  let archived = false
  let blocked = true
  const horse = () => ({ id, name: 'Валдай', deletedAt: archived ? '2026-11-22T09:00:00Z' : null,
    isUnavailable: archived, isPublic: !archived, status: 'active', maxDailyMinutes: 120, minRestMinutes: 45 })
  await page.route('**/api/horses?*', route => {
    const include = new URL(route.request().url()).searchParams.get('includeArchived') === 'true'
    const rows = !archived || include ? [horse()] : []
    return route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } })
  })
  await page.route(`**/api/horses/${id}`, route => {
    if (route.request().method() === 'DELETE') {
      if (blocked) return route.fulfill({ status: 409, json: { message: 'У лошади есть запланированные занятия. Сначала снимите её с расписания или замените лошадь.' } })
      archived = true
      return route.fulfill({ json: horse() })
    }
    return route.fulfill({ json: { ...horse(), boardingContracts: [], healthLogs: [], bookings: [{ id: 'past', attendanceStatus: 'ATTENDED',
      client: { name: 'Анна' }, lesson: { startTime: '2026-10-01T09:00:00Z', service: { title: 'Выездка' } } }] } })
  })
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/horses')
  const filter = page.getByRole('checkbox', { name: 'Показать архивных' })
  await expect(filter).not.toBeChecked()
  await page.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByText('Удалить лошадь из клуба? Если по лошади есть история занятий или постоя, она будет перенесена в архив с сохранением всех отчётов')).toBeVisible()
  await page.locator('.ant-popconfirm').getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByText('У лошади есть запланированные занятия.', { exact: false }).last()).toBeVisible()
  expect(archived).toBe(false)
  blocked = false
  await page.getByRole('button', { name: 'Удалить', exact: true }).first().click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Валдай', exact: true })).toHaveCount(0)
  await filter.focus()
  await filter.press('Space')
  await expect(filter).toBeChecked()
  await page.getByRole('button', { name: 'Валдай', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка лошади' })
  await expect(card.getByText('Лошадь в архиве').first()).toBeVisible()
  await expect(card.getByText('Выездка')).toBeVisible()
  await expect(card.getByText('Предстоящие занятия и расписание')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
  await page.goto(`/horses?horseId=${id}`)
  await expect(page.getByRole('dialog', { name: 'Карточка лошади' }).getByText('Выездка')).toBeVisible()
  await page.screenshot({ path: `test-results/horse-archive-${width}.png`, animations: 'disabled' })
})
