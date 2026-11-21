import { test, expect, type Page } from '@playwright/test';
import type { TelegramWebApp } from '../src/telegram';

declare global { interface Window { __riderNext(): void; __riderReady(): boolean } }
const id = '11111111-1111-4111-8111-111111111111';
const trainerId = '22222222-2222-4222-8222-222222222222';
const start = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10) + 'T12:00:00+03:00';
async function setup(page: Page, delayed = false) {
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '' }));
  await page.addInitScript(({ delayed }) => {
    let next = () => {}, enabled = false;
    const app: TelegramWebApp = {
      initData: delayed ? '' : 'signed-rider', initDataUnsafe: { user: { id: 123, first_name: 'Анна' } },
      safeAreaInset: { top: 36, bottom: 20, left: 0, right: 0 }, themeParams: {},
      ready() {}, expand() {}, enableClosingConfirmation() {}, disableClosingConfirmation() {}, onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {}, showProgress() {}, hideProgress() {}, setParams(p) { enabled = p.is_active; },
        onClick(fn) { next = fn; }, offClick(fn) { if (next === fn) next = () => {}; } },
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    };
    window.Telegram = { WebApp: app };
    window.__riderReady = () => enabled;
    window.__riderNext = () => { if (enabled) next(); };
    if (delayed) setTimeout(() => { app.initData = 'signed-rider'; }, 350);
  }, { delayed });
  let confirmed = false, cancelled = false, fail = false, creates = 0, confirms = 0, cancels = 0;
  const row = () => ({ id, startTime: start, endTime: start, status: cancelled ? 'cancelled_client' : 'scheduled', clientConfirmed: confirmed,
    canCancel: !cancelled, canConfirm: !confirmed && !cancelled, trainer: { name: 'Мария Тренер' }, horse: { name: 'Гром' },
    lesson: { status: cancelled ? 'CANCELLED' : 'SCHEDULED', deletedAt: null, startTime: start, endTime: start, service: { title: 'Индивидуальная тренировка' } } });
  await page.route('**/api/tma/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/bootstrap')) {
      expect(route.request().postDataJSON()).toEqual({ initData: 'signed-rider' });
      return route.fulfill({ json: { role: 'CLIENT', clientId: id, token: 'client-only-session', clientName: 'Анна Всадник' } });
    }
    expect(route.request().headers().authorization).toBe('Bearer client-only-session');
    if (path.endsWith('/overview')) return route.fulfill({ json: { client: { id, name: 'Анна Всадник', phone: '+79991234567' },
      membership: { id, title: 'Тариф 8 тренировок', remainingLessons: cancelled ? 6 : 5, totalLessons: 8, validUntil: start, isExpiringSoon: false }, bookings: [row()] } });
    if (path.endsWith('/confirm')) { confirms++; confirmed = true; return route.fulfill({ json: row() }); }
    if (path.endsWith('/cancel')) {
      cancels++; if (fail) return route.fulfill({ status: 409, json: { message: 'Занятие изменилось. Повторите попытку' } });
      cancelled = true; return route.fulfill({ json: row() });
    }
    if (path.endsWith('/services')) return route.fulfill({ json: { consentVersion: '2026-09-19', services: [{ id, title: 'Индивидуальная тренировка', name: 'Тренировка', durationMinutes: 60, price: '2000' }] } });
    if (path.endsWith('/slots')) return route.fulfill({ json: { slots: [{ startTime: start, endTime: start, trainers: [{ id: trainerId, name: 'Мария Тренер' }] }] } });
    if (path.endsWith('/bookings')) { creates++; expect(route.request().postDataJSON()).toMatchObject({ serviceId: id, trainerId, consentAccepted: true }); return route.fulfill({ status: 201, json: row() }); }
    return route.fulfill({ status: 404, json: { message: 'Unexpected route' } });
  });
  return { counts: () => ({ creates, confirms, cancels }), fail: (value: boolean) => { fail = value; } };
}

async function advance(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__riderReady())).toBe(true);
  await page.evaluate(() => window.__riderNext());
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('linked rider waits for SDK, sees profile, confirms, cancels and books a slot at 390×844', async ({ page }) => {
  const mock = await setup(page, true);
  const forbiddenScreens: string[] = [];
  await page.exposeFunction('recordGate', (text: string) => forbiddenScreens.push(text));
  await page.addInitScript(() => {
    new MutationObserver(() => { if (document.body?.textContent?.includes('Выполните вход')) void (window as unknown as { recordGate(text: string): Promise<void> }).recordGate('login'); }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('client');
  await expect(page.getByRole('heading', { name: 'Кабинет всадника' })).toBeVisible();
  await expect(page.getByText('Анна Всадник', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Мой абонемент' })).toContainText('5 шт.');
  expect(await page.locator('main').evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBeGreaterThanOrEqual(36);
  await noOverflow(page);
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.getByText('Подтверждена', { exact: true })).toBeVisible();
  expect(mock.counts().confirms).toBe(1);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await page.getByRole('button', { name: 'Оставить запись' }).click();
  expect(mock.counts().cancels).toBe(0);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByText('Отменена', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Мой абонемент' })).toContainText('6 шт.');
  expect(mock.counts().cancels).toBe(1);
  await page.screenshot({ path: 'test-results/rider-cabinet.png', fullPage: true });
  await page.getByRole('button', { name: '+ Записаться на тренировку' }).click();
  await page.getByRole('button', { name: /Индивидуальная тренировка 60/ }).click();
  await advance(page);
  await page.getByRole('button', { name: '12:00' }).click();
  await page.getByRole('combobox', { name: 'Тренер' }).selectOption(trainerId);
  await advance(page);
  await expect(page.getByLabel('Телефон', { exact: true })).toHaveValue('+79991234567');
  await page.getByRole('checkbox').check();
  await noOverflow(page);
  await expect.poll(() => page.evaluate(() => window.__riderReady())).toBe(true);
  await page.evaluate(() => { window.__riderNext(); window.__riderNext(); });
  await expect(page.getByRole('heading', { name: 'Ждём вас в клубе' })).toBeVisible();
  expect(mock.counts().creates).toBe(1);
  expect(forbiddenScreens).toEqual([]);
  await noOverflow(page);
});

test('failed cancellation retains confirmation and retries; dark theme and long content fit 360–430 px', async ({ page }) => {
  const mock = await setup(page); mock.fail(true);
  await page.goto('client');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByRole('alert')).toContainText('Занятие изменилось');
  await expect(page.getByRole('button', { name: 'Подтвердить отмену' })).toBeEnabled();
  mock.fail(false);
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByText('Отменена', { exact: true })).toBeVisible();
  for (const width of [360, 390, 430]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(page); }
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
});
