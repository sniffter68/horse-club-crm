import { test, expect, type Page } from '@playwright/test';
import type { TelegramWebApp } from '../src/telegram';

declare global { interface Window { __riderNext(): void; __riderReady(): boolean; __loginSeen: boolean } }
const id = '11111111-1111-4111-8111-111111111111';
const trainerId = '22222222-2222-4222-8222-222222222222';
const start = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10) + 'T12:00:00+03:00';
async function setup(page: Page, delayed = false) {
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '' }));
  await page.addInitScript(({ delayed }) => {
    window.__loginSeen = false;
    new MutationObserver(() => {
      if (document.body?.textContent?.includes('Выполните вход')) window.__loginSeen = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
    let next = () => {}, enabled = false;
    const app: TelegramWebApp = {
      initData: delayed ? '' : 'signed-rider', initDataUnsafe: { user: { id: 1808998846, first_name: 'Инна', last_name: 'Ярцева' } },
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
    canCancel: !cancelled, canReschedule: !cancelled, canConfirm: !confirmed && !cancelled, trainer: { name: 'Мария Тренер' }, horse: { name: 'Гром' },
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

test('client reschedules with native date/time controls, preserves selection after conflict and recovers from empty slots', async ({ page }) => {
  await setup(page);
  let empty = true, conflict = true, moves = 0;
  await page.route('**/api/tma/client/lessons/*/reschedule-slots?*', route => route.fulfill({ json: { slots: empty ? [] : [{ startTime: '12:30', available: true }] } }));
  await page.route('**/api/tma/client/lessons/*/reschedule', route => {
    moves++;
    expect(route.request().postDataJSON()).toMatchObject({ startTime: '12:30' });
    expect(route.request().headers().authorization).toBe('Bearer client-only-session');
    return route.fulfill(conflict ? { status: 409, json: { message: 'Тренер занят. Выберите другое время' } } : { json: { updated: true } });
  });
  await page.goto('/tma/');
  const trigger = page.getByRole('button', { name: 'Перенести', exact: true });
  await trigger.click();
  await expect(page.getByText('Свободного времени нет. Выберите другой день.')).toBeVisible();
  empty = false;
  await page.getByRole('button', { name: 'Завтра', exact: true }).click();
  await page.getByLabel('Время по Москве').selectOption('12:30');
  await page.getByRole('button', { name: 'Подтвердить перенос' }).click();
  await expect(page.getByRole('alert')).toContainText('Тренер занят');
  await expect(page.getByLabel('Время по Москве')).toHaveValue('12:30');
  conflict = false;
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/rider-reschedule.png', fullPage: true });
  await page.getByRole('button', { name: 'Подтвердить перенос' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Занятие перенесено' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Перенос занятия' })).toHaveCount(0);
  expect(moves).toBe(2);
});

test('linked rider waits for SDK, sees profile, confirms, cancels and books a slot at 390×844', async ({ page }) => {
  const mock = await setup(page, true);
  const forbiddenScreens: string[] = [];
  await page.exposeFunction('recordGate', (text: string) => forbiddenScreens.push(text));
  await page.addInitScript(() => {
    new MutationObserver(() => { if (document.body?.textContent?.includes('Выполните вход')) void (window as unknown as { recordGate(text: string): Promise<void> }).recordGate('login'); }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/tma/');
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
  await page.goto('/tma/');
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

test('unlinked Telegram client sees phone linking and rechecks after sharing contact', async ({ page }) => {
  await setup(page, true);
  let linked = false;
  await page.route('**/api/tma/bootstrap', route => route.fulfill({ json: linked
    ? { role: 'CLIENT', clientId: id, token: 'client-only-session' }
    : { role: 'UNLINKED_CLIENT', needsPhoneLink: true } }));
  await page.route('**/api/tma/client/request-contact', route => route.fulfill({ json: { sent: true } }));
  await page.goto('/tma/');
  await expect(page.getByRole('heading', { name: 'Привязка кабинета' })).toBeVisible();
  await page.getByRole('button', { name: 'Привязать по телефону' }).click();
  await expect(page.getByRole('status')).toContainText('Отправьте свой контакт');
  linked = true;
  await page.getByRole('button', { name: 'Проверить привязку' }).click();
  await expect(page.getByRole('heading', { name: 'Кабинет всадника' })).toBeVisible();
  expect(await page.evaluate(() => window.__loginSeen)).toBe(false);
});

test('bootstrap loading and server failure never show CRM login; keyboard retry opens cabinet', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let fail = true;
  await page.route('**/api/tma/bootstrap', async route => {
    await pending;
    await route.fulfill(fail ? { status: 503, json: { message: 'Сервис временно недоступен' } }
      : { json: { role: 'CLIENT', clientId: id, token: 'client-only-session' } });
  });
  await page.goto('/tma/');
  await expect(page.getByRole('status')).toHaveText('Загружаем личный кабинет…');
  await expect(page.getByRole('button')).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  fail = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Кабинет всадника' })).toBeVisible();
  expect(await page.evaluate(() => window.__loginSeen)).toBe(false);
});

test('expired client session bootstraps once again using initData and retries overview', async ({ page }) => {
  await setup(page);
  let bootstraps = 0, expired = false;
  await page.route('**/api/tma/bootstrap', route => {
    bootstraps++;
    expect(route.request().postDataJSON()).toEqual({ initData: 'signed-rider' });
    return route.fulfill({ json: { role: 'CLIENT', clientId: id, token: bootstraps === 1 ? 'expired' : 'renewed' } });
  });
  await page.route('**/api/tma/client/overview', route => {
    if (route.request().headers().authorization === 'Bearer expired') {
      expired = true;
      return route.fulfill({ status: 401, json: { message: 'Сессия истекла' } });
    }
    expect(route.request().headers().authorization).toBe('Bearer renewed');
    return route.fulfill({ json: { client: { id, name: 'Инна Ярцева', phone: '+79991234567' }, membership: null, bookings: [] } });
  });
  await page.goto('/tma/');
  await expect(page.getByRole('heading', { name: 'Кабинет всадника' })).toBeVisible();
  await expect(page.getByText('Инна Ярцева')).toBeVisible();
  expect(expired).toBe(true); expect(bootstraps).toBe(2);
  expect(await page.evaluate(() => window.__loginSeen)).toBe(false);
});
