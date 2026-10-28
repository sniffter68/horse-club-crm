import { test, expect } from './fixtures'

const id = '00000000-0000-4000-8000-000000000081'
const membershipId = '00000000-0000-4000-8000-000000000082'

for (const readOnly of [false, true]) test(`empty client hard deletion, readOnly=${readOnly}`, async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'MANAGER')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: [
    { module: 'SCHEDULE', isEnabled: true, accessLevel: readOnly ? 'READ_ONLY' : 'FULL' },
  ] } }))
  let deleted = false
  const row = { id, name: 'Новый Клиент', firstName: 'Новый', lastName: 'Клиент', membership: null,
    createdAt: '2026-10-21', phone: null, preferences: '', clientType: 'REGULAR', deletedAt: null }
  await page.route('**/api/clients?*', route => route.fulfill({ json: deleted ? [] : [row], headers: { 'x-total-count': deleted ? '0' : '1' } }))
  await page.route(`**/api/clients/${id}`, route => {
    if (route.request().method() === 'DELETE') {
      deleted = true
      return route.fulfill({ json: { id, softDeleted: false, message: 'Клиент удален безвозвратно' } })
    }
    return route.fulfill({ json: { ...row, _count: { bookings: 0, payments: 0, memberships: 0 }, boardingBalance: '0',
      memberships: [], bookings: [], payments: [], boardingContracts: [] } })
  })
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Новый Клиент', exact: true }).click()
  if (readOnly) {
    await expect(page.getByRole('button', { name: 'Удалить клиента', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Восстановить', exact: true })).toHaveCount(0)
    expect(deleted).toBe(false)
    return
  }
  await page.getByRole('dialog', { name: 'Карточка клиента' }).getByRole('button', { name: 'Удалить', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Удалить клиента?', exact: true })
  await expect(dialog).toContainText('Клиент будет удален безвозвратно')
  await dialog.getByRole('button', { name: 'Удалить безвозвратно', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Новый Клиент', exact: true })).toBeHidden()
  expect(deleted).toBe(true)
})

for (const width of [1280, 390]) test(`client archive, membership cancellation and restoration at ${width}px`, async ({ page }) => {
  test.setTimeout(40000)
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', 'ADMIN')
  })
  let archived = false
  let fail = true
  let removedMembership = false
  const row = () => ({ id, name: 'Анна Архивная', firstName: 'Анна', lastName: 'Архивная', clientType: 'REGULAR',
    phone: null, isRider: true, isPayer: true, preferences: '', createdAt: '2026-10-01T10:00:00Z',
    deletedAt: archived ? '2026-10-21T10:00:00Z' : null, membership: null })
  const membership = () => ({ id: membershipId, deletedAt: removedMembership ? '2026-10-21' : null,
    title: '8 занятий', status: 'active', totalLessons: 8, remainedLessons: 5, validUntil: '2099-12-31', createdAt: '2026-10-01',
    totalPrice: 8000, pricingPlan: { id: 'plan', name: '8 занятий' }, isActive: !removedMembership,
    payments: [{ id: 'p', amount: 8000, status: 'PAID', createdAt: '2026-10-01' }],
    _count: { operations: 2, payments: 1, bookings: 3, transactions: 2 } })
  await page.route('**/api/clients?*', route => {
    const params = new URL(route.request().url()).searchParams
    const visible = params.get('includeArchived') === 'true' || (params.get('archivedOnly') === 'true' ? archived : !archived)
    return route.fulfill({ json: visible ? [row()] : [], headers: { 'x-total-count': visible ? '1' : '0' } })
  })
  await page.route(`**/api/clients/${id}`, route => {
    if (route.request().method() === 'DELETE') {
      if (fail) return route.fulfill({ status: 409, json: { message: 'История изменилась. Повторите действие' } })
      archived = true
      return route.fulfill({ json: { id, softDeleted: true, message: 'Клиент перенесен в архив' } })
    }
    return route.fulfill({ json: { ...row(), _count: { bookings: 3, payments: 1, memberships: 1 },
      memberships: [membership()], bookings: [], payments: [], boardingContracts: [] } })
  })
  await page.route(`**/api/clients/${id}/restore`, route => { archived = false; return route.fulfill({ json: row() }) })
  await page.route(`**/api/memberships/${membershipId}`, route => {
    if (route.request().method() === 'DELETE') {
      removedMembership = true
      return route.fulfill({ json: { id: membershipId, softDeleted: true, message: 'Абонемент аннулирован и перенесен в архив' } })
    }
    return route.fulfill({ json: membership() })
  })
  await page.route(`**/api/memberships/${membershipId}/refund-quote`, route => route.fulfill({ json: { amount: '5000', refundMethod: 'CASH', cancelled: false } }))
  await page.route(`**/api/memberships/${membershipId}/cancel`, route => { removedMembership = true; return route.fulfill({ json: { success: true } }) })
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Анна Архивная', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка клиента', exact: true })
  await card.getByRole('button', { name: 'Удалить / аннулировать', exact: true }).click()
  const annul = page.getByRole('dialog', { name: 'Удалить / аннулировать?', exact: true })
  await expect(annul).toContainText('Сумма к возврату:')
  await expect(annul.getByRole('checkbox', { name: 'Оформить возврат в кассу' })).toBeChecked()
  await expect(annul.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
  await annul.getByRole('button', { name: 'Удалить / аннулировать', exact: true }).click()
  await expect(card.getByText('В архиве', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Удалить', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Удалить клиента?', exact: true })
  await expect(dialog).toContainText('3 занятий')
  await dialog.getByRole('button', { name: /В архив/ }).click()
  await expect(dialog.getByRole('alert')).toContainText('История изменилась')
  fail = false
  await page.screenshot({ path: `test-results/client-archive-${width}.png` })
  await dialog.getByRole('button', { name: /В архив/ }).click()
  await expect(card).toBeHidden()
  const filter = page.getByRole('combobox', { name: 'Архив клиентов' })
  await filter.focus()
  await filter.press('ArrowDown')
  await page.getByTitle('Архив', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Восстановить', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await page.getByRole('dialog', { name: 'Восстановить?', exact: true }).getByRole('button', { name: 'Восстановить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Восстановить', exact: true })).toBeHidden()
  expect(archived).toBe(false)
})
