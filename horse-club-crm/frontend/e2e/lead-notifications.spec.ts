import { test, expect, type Page } from './fixtures'

const payload = { id: '22222222-2222-4222-8222-222222222222', clientName: 'Анна', phone: '+79991234567', serviceName: 'Конкур', createdAt: '2026-10-21T09:00:00Z' }

async function setup(page: Page, permission = 'granted', role = 'ADMIN') {
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role, modules:
    ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: 'FULL' })) } }))
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { role, permissions: { boardingAccess: true } } }))
  await page.addInitScript({ content: `
    localStorage.setItem('horsecrm.access_token', 'cookie-session');
    localStorage.setItem('horsecrm.role', ${JSON.stringify(role)});
    localStorage.setItem('horsecrm.email', 'qa@example.com');
    window.__leadQA = { pushes: [], plays: 0, focus: 0, requests: 0, blocked: false };
    const originalFocus = window.focus.bind(window);
    window.focus = () => { window.__leadQA.focus++; originalFocus(); };
    window.Notification = class {
      static permission = ${JSON.stringify(permission)};
      static requestPermission() { window.__leadQA.requests++; this.permission = 'granted'; return Promise.resolve('granted'); }
      constructor(title, options) { this.title = title; this.options = options; window.__leadQA.pushes.push(this); }
      close() { this.onclose?.(); }
    };
    HTMLMediaElement.prototype.play = function() {
      if (this.volume > 0) window.__leadQA.plays++;
      return window.__leadQA.blocked ? Promise.reject(new DOMException('Blocked', 'NotAllowedError')) : Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function() {};
  ` })
  let summaryCalls = 0
  await page.route('**/api/dashboard/summary', route => {
    summaryCalls++
    return route.fulfill({ json: {
      generatedAt: payload.createdAt, workDay: { openAt: payload.createdAt, closeAt: payload.createdAt, timeZone: 'Europe/Moscow' },
      alerts: [], horseWorkloads: [], leadRequests: [], kpi: { lessonsTotal: 0, lessonsCompleted: 0, newLeads: 0, activeMemberships: 0 },
    } })
  })
  await page.route('**/api/clients*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  let emit: (() => void) | undefined
  await page.route('**/api/leads/events', async route => {
    await new Promise<void>(resolve => { emit = resolve })
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body:
      `event: lead:created\nid: event-1\ndata: ${JSON.stringify(payload)}\n\nevent: lead:created\nid: event-1\ndata: ${JSON.stringify(payload)}\n\n` })
  })
  await page.goto(new URL('/clients', process.env.CRM_TEST_BASE_URL || 'http://localhost:5173').href)
  await expect(page.getByRole('button', { name: 'Уведомления о заявках', exact: true })).toHaveCount(role === 'ADMIN' ? 1 : 0)
  if (role === 'ADMIN') await expect.poll(() => Boolean(emit)).toBe(true)
  return { emit: () => emit?.(), summaryCalls: () => summaryCalls }
}

test('native EventSource receives a lead with hidden visibility; push click requests focus and opens leads', async ({ page }) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'Уведомления о заявках', exact: true }).click()
  await page.keyboard.press('Escape')
  // Playwright forces focus emulation. Explicitly emulate the hidden state here;
  // native OS notification display/focus is covered by the manual checklist.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(await page.evaluate(() => document.visibilityState)).toBe('hidden')
  state.emit()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__leadQA').pushes.length)).toBe(1)
  expect(await page.evaluate(() => Reflect.get(window, '__leadQA').plays)).toBe(1)
  expect(await page.evaluate(() => Reflect.get(window, '__leadQA').pushes[0].options)).toMatchObject({ body: 'Анна (+79991234567) — Конкур', tag: `lead-${payload.id}`, silent: true, requireInteraction: true })
  await page.evaluate(() => Reflect.get(window, '__leadQA').pushes[0].onclick())
  await expect(page).toHaveURL(/\/#pending-leads$/)
  expect(await page.evaluate(() => Reflect.get(window, '__leadQA').focus)).toBe(1)
  await page.bringToFront()
  await expect(page.locator('#pending-leads')).toBeVisible()
  await expect.poll(state.summaryCalls).toBeGreaterThan(0)
})

test('permission is requested only on click, sound preference survives reload, and toast opens leads', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await setup(page, 'default')
  expect(await page.evaluate(() => Reflect.get(window, '__leadQA').requests)).toBe(0)
  await page.getByRole('button', { name: 'Включить звуковые пуши о заявках' }).click()
  expect(await page.evaluate(() => Reflect.get(window, '__leadQA').requests)).toBe(1)
  await page.getByRole('button', { name: 'Уведомления о заявках', exact: true }).click()
  await page.getByRole('switch', { name: 'Звук новых заявок' }).click()
  await expect(page.getByRole('switch', { name: 'Звук новых заявок' })).not.toBeChecked()
  await expect(page.locator('.ant-popover:visible')).toHaveCSS('opacity', '1')
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.lead-notification-sound'))).toBe('false')
  await page.keyboard.press('Escape')
  const plays = await page.evaluate(() => Reflect.get(window, '__leadQA').plays)
  await page.clock.install()
  state.emit()
  await expect(page.getByRole('button', { name: 'Открыть заявку', exact: true })).toBeVisible()
  await page.clock.fastForward(60_000)
  await expect(page.getByRole('button', { name: 'Открыть заявку', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__leadQA').plays)).toBe(plays)
  await page.getByRole('button', { name: 'Открыть заявку', exact: true }).click()
  await expect(page).toHaveURL(/\/#pending-leads$/)
  await page.reload()
  await page.getByRole('button', { name: 'Уведомления о заявках', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Звук новых заявок' })).not.toBeChecked()
  await expect(page.locator('.ant-popover:visible')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: '../docs/test-reports/lead-notifications-mobile.png' })
})

test('denied push permission and blocked audio preserve the toast and offer sound recovery', async ({ page }) => {
  const state = await setup(page, 'denied')
  await page.evaluate(() => { Reflect.get(window, '__leadQA').blocked = true })
  state.emit()
  await expect(page.getByRole('button', { name: 'Открыть заявку', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__leadQA').pushes)).toHaveLength(0)
  await page.getByRole('button', { name: 'Уведомления о заявках', exact: true }).click()
  await expect(page.getByText('Уведомления запрещены.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Разрешить звук', exact: true })).toBeVisible()
  await page.evaluate(() => { Reflect.get(window, '__leadQA').blocked = false })
  await page.getByRole('button', { name: 'Разрешить звук', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Разрешить звук', exact: true })).toHaveCount(0)
})

test('manager does not subscribe to ADMIN-only lead details', async ({ page }) => {
  let requests = 0
  page.on('request', request => { if (request.url().includes('/leads/events')) requests++ })
  await setup(page, 'granted', 'MANAGER')
  await expect(page.getByRole('button', { name: 'Включить звуковые пуши о заявках' })).toHaveCount(0)
  expect(requests).toBe(0)
})
