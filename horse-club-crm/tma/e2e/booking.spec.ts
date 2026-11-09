import { expect, test, type Page } from '@playwright/test';
import type { TelegramWebApp } from '../src/telegram';

declare global {
  interface Window {
    __tmaTest: { main(): void; back(): void; active(): boolean; haptics(): number; theme(): void };
  }
}
const serviceId = '11111111-1111-4111-8111-111111111111';
const trainerId = '22222222-2222-4222-8222-222222222222';
const bookingId = '33333333-3333-4333-8333-333333333333';
const start = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) + 'T12:00:00+03:00';
const service = { id: serviceId, title: 'Первое знакомство', name: 'Знакомство', description: 'Спокойное занятие для начинающих', price: '1500', durationMinutes: 30 };
const booking = { id: bookingId, status: 'scheduled', startTime: start, endTime: start, clientConfirmed: false,
  clientCancellationRequested: false, costAmount: '1500', trainer: { name: 'Анна' },
  lesson: { status: 'SCHEDULED', deletedAt: null, startTime: start, endTime: start, service } };
async function setup(page: Page) {
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.addInitScript(() => {
    let main = () => {}, back = () => {}, theme = () => {}, enabled = false, haptics = 0;
    const app: TelegramWebApp = {
      initData: 'signed-data-test', initDataUnsafe: { user: { id: 123, first_name: 'Елена', username: 'elena' } },
      themeParams: { bg_color: '#17241c', text_color: '#f0f4f1', button_color: '#a4d5b8', button_text_color: '#163326', hint_color: '#b3bdb6', secondary_bg_color: '#28332c' },
      MainButton: { show() {}, hide() {}, showProgress() {}, hideProgress() {},
        setParams(params) { enabled = params.is_active && params.is_visible; },
        onClick(callback) { main = callback; }, offClick(callback) { if (main === callback) main = () => {}; } },
      BackButton: { show() {}, hide() {}, onClick(callback) { back = callback; }, offClick(callback) { if (back === callback) back = () => {}; } },
      HapticFeedback: { impactOccurred() { haptics++; } }, ready() {}, expand() {}, enableClosingConfirmation() {}, disableClosingConfirmation() {},
      onEvent(_event, callback) { theme = callback; }, offEvent() {},
    };
    window.Telegram = { WebApp: app };
    window.__tmaTest = { main() { if (enabled) main(); }, back() { back(); }, active: () => enabled, haptics: () => haptics, theme() { app.themeParams.bg_color = '#f7f4f0'; theme(); } };
  });
  await page.route('**/api/tma/services', route => route.fulfill({ json: { services: [service], consentVersion: '2026-09-19' } }));
  await page.route('**/api/tma/slots?**', route => route.fulfill({ json: { slots: [{ startTime: start, endTime: start, trainers: [{ id: trainerId, name: 'Анна' }] }] } }));
  await page.route('**/api/tma/my-bookings?**', route => route.fulfill({ json: { bookings: [booking], hasMore: false } }));
}
async function advance(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__tmaTest.active())).toBe(true);
  await page.evaluate(() => window.__tmaTest.main());
}

test('membership appears above bookings with Moscow date and expiry warning, including empty booking history', async ({ page }) => {
  await setup(page);
  await page.route('**/api/tma/my-bookings?**', route => route.fulfill({ json: {
    bookings: [], hasMore: false, membership: { id: serviceId, title: 'Семейный абонемент на занятия в манеже',
      remainingLessons: 1, totalLessons: 8, validUntil: '2026-12-09T21:30:00Z', isExpiringSoon: true },
  } }));
  await page.goto('');
  await page.getByRole('button', { name: 'Мои записи', exact: true }).click();
  const card = page.getByRole('region', { name: 'Мой абонемент', exact: true });
  await expect(card.getByRole('heading')).toHaveText('Семейный абонемент на занятия в манеже');
  await expect(card).toContainText('Осталось: 1 из 8');
  await expect(card).toContainText('10.12.2026');
  await expect(card).toContainText('Абонемент скоро закончится');
  await expect(page.getByText('У вас пока нет активных записей')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tma-membership-dark.png', fullPage: true });
  await page.evaluate(() => {
    const app = window.Telegram!.WebApp;
    Object.assign(app.themeParams, { bg_color: '#f7f4f0', text_color: '#3a2f2b', button_color: '#234d3c', button_text_color: '#ffffff', hint_color: '#6c655f', secondary_bg_color: '#ffffff' });
    window.__tmaTest.theme();
  });
  await page.screenshot({ path: 'test-results/tma-membership-light.png', fullPage: true });
});

test('membership loading and error do not claim no subscription; keyboard retry recovers to empty state', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let fail = true;
  await page.route('**/api/tma/my-bookings?**', async route => {
    await pending;
    await route.fulfill(fail ? { status: 503, json: { message: 'Повторите запрос позже' } }
      : { json: { bookings: [booking], hasMore: false, membership: null } });
  });
  await page.goto('');
  await page.getByRole('button', { name: 'Мои записи', exact: true }).click();
  await expect(page.getByText('Загружаем ваши записи…')).toBeVisible();
  await expect(page.getByText(/У вас нет активного абонемента/)).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('Повторите запрос позже');
  await expect(page.getByText(/У вас нет активного абонемента/)).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Обновить записи' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/У вас нет активного абонемента/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Предстоящие тренировки' })).toBeVisible();
});

test('regular membership has no warning and stays above booking list after pagination', async ({ page }) => {
  await setup(page);
  await page.route('**/api/tma/my-bookings?**', route => {
    const secondPage = new URL(route.request().url()).searchParams.get('offset') !== '0';
    return route.fulfill({ json: { bookings: secondPage ? [] : [booking], hasMore: !secondPage,
      membership: { id: serviceId, title: 'Манеж', remainingLessons: 5, totalLessons: 8, validUntil: '2027-01-01T12:00:00Z', isExpiringSoon: false } } });
  });
  await page.goto('');
  await page.getByRole('button', { name: 'Мои записи', exact: true }).click();
  const card = page.getByRole('region', { name: 'Мой абонемент', exact: true });
  await expect(card).toContainText('Осталось: 5 из 8');
  await expect(page.getByText('Абонемент скоро закончится')).toHaveCount(0);
  const list = page.getByRole('region', { name: 'Предстоящие тренировки', exact: true });
  expect((await card.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y);
  await page.getByRole('button', { name: 'Загрузить ещё' }).click();
  await expect(page.getByRole('button', { name: 'Загрузить ещё' })).toHaveCount(0);
  await expect(card).toContainText('Осталось: 5 из 8');
});
async function checkout(page: Page) {
  await page.goto('');
  await page.getByRole('button', { name: /Первое знакомство 30/ }).click(); await advance(page);
  await expect(page.getByRole('heading', { name: 'Когда приедете?' })).toBeVisible();
  await page.getByRole('button', { name: '12:00' }).click();
  await page.getByLabel('Тренер').selectOption(trainerId); await advance(page);
  await expect(page.getByLabel('Ваше имя')).toHaveValue('Елена');
}

test('render failure shows diagnostic boundary and reload recovers', async ({ page }) => {
  await setup(page);
  let broken = true;
  await page.route('**/api/tma/services', route => route.fulfill({
    json: { services: broken ? [null] : [service], consentVersion: '2026-09-19' },
  }));
  await page.goto('');
  await expect(page.getByRole('heading', { name: 'Ошибка приложения' })).toBeVisible();
  await expect(page.locator('[role="alert"] pre').first()).not.toBeEmpty();
  await expect(page.locator('[role="alert"] pre').nth(1)).not.toBeEmpty();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tma-error-boundary.png', fullPage: true });
  broken = false;
  await page.getByRole('button', { name: 'Перезагрузить' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Первое знакомство 30/ })).toBeVisible();
});

test('SDK without BackButton keeps rendering through navigation and cleanup', async ({ page }) => {
  await setup(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const app = window.Telegram?.WebApp;
    if (app) delete app.BackButton;
  });
  await checkout(page);
  await page.getByRole('button', { name: 'Мои записи', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мои записи' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('throwing Telegram bridge methods do not crash rendering or event handlers', async ({ page }) => {
  await setup(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const app = window.Telegram?.WebApp;
    if (!app) return;
    const unsupported = () => { throw new Error('Unsupported Telegram bridge method'); };
    app.ready = unsupported; app.expand = unsupported;
    app.enableClosingConfirmation = unsupported; app.disableClosingConfirmation = unsupported;
    app.onEvent = unsupported; app.offEvent = unsupported;
    app.BackButton = { show: unsupported, hide: unsupported, onClick: unsupported, offClick: unsupported };
    app.HapticFeedback = { impactOccurred: unsupported };
    app.requestContact = () => {};
    app.isVersionAtLeast = unsupported;
  });
  await checkout(page);
  await expect(page.getByRole('button', { name: '📱 Заполнить из Telegram' })).toHaveCount(0);
  await page.getByLabel('Телефон', { exact: true }).fill('+79991234567');
  await page.getByRole('checkbox').check();
  await expect.poll(() => page.evaluate(() => window.__tmaTest.active())).toBe(true);
  expect(errors).toEqual([]);
});

test('contact request fills phone, prevents duplicates and retains manual fallback', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const app = window.Telegram?.WebApp;
    if (app) app.requestContact = callback => { setTimeout(() => callback(true, { responseUnsafe: { contact: { phone_number: '79991234567', first_name: 'Елена' } } }), 100); };
  });
  await checkout(page);
  const button = page.getByRole('button', { name: '📱 Заполнить из Telegram' });
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Ожидаем Telegram…' })).toBeDisabled();
  await expect(page.getByLabel('Телефон', { exact: true })).toHaveValue('+79991234567');
  await expect(page.getByRole('status')).toContainText('Номер получен из Telegram');
  await page.getByLabel('Телефон', { exact: true }).fill('+79997654321');
  await expect(page.getByText('Номер получен из Telegram.')).toHaveCount(0);
  await page.evaluate(() => { const app = window.Telegram?.WebApp; if (app) app.requestContact = callback => callback(false); });
  await button.click();
  await expect(page.getByRole('status')).toContainText('Введите номер вручную');
  await expect(page.getByLabel('Телефон', { exact: true })).toHaveValue('+79997654321');
  await expect(page.getByLabel('Телефон', { exact: true })).toBeFocused();
  await page.evaluate(() => { const app = window.Telegram?.WebApp; if (app) app.requestContact = () => { throw new Error('unsupported'); }; });
  await button.click(); await expect(button).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tma-phone-contact.png', fullPage: true });
});

test('SDK without requestContact leaves manual phone entry available', async ({ page }) => {
  await setup(page); await checkout(page);
  await expect(page.getByRole('button', { name: '📱 Заполнить из Telegram' })).toHaveCount(0);
  await page.getByLabel('Телефон', { exact: true }).fill('+79991234567');
  await page.getByRole('checkbox').check();
  await expect.poll(() => page.evaluate(() => window.__tmaTest.active())).toBe(true);
});
test('native Telegram flow creates once, shows success and requests cancellation at narrow width', async ({ page }) => {
  await setup(page); let writes = 0, cancellations = 0;
  await page.route('**/api/tma/bookings', async route => {
    writes++; const body: unknown = route.request().postDataJSON();
    expect(body).toMatchObject({ serviceId, trainerId, consentAccepted: true });
    expect(route.request().headers()['x-telegram-init-data']).toBe('signed-data-test');
    await new Promise(resolve => setTimeout(resolve, 100)); await route.fulfill({ json: booking, status: 201 });
  });
  await page.route(`**/bookings/${bookingId}/cancel-request`, route => { cancellations++; return route.fulfill({ json: { ...booking, clientCancellationRequested: true } }); });
  await checkout(page);
  await expect.poll(() => page.evaluate(() => window.__tmaTest.active())).toBe(false);
  await page.getByLabel('Телефон', { exact: true }).fill('+79991234567'); await page.getByRole('checkbox').check();
  await advance(page); await page.evaluate(() => window.__tmaTest.main());
  await expect(page.getByRole('heading', { name: 'Ждём вас в клубе' })).toBeVisible(); expect(writes).toBe(1);
  await page.getByRole('region', { name: 'Информация о записи' }).getByRole('button', { name: 'Мои записи', exact: true }).click();
  await expect(page.getByText('Ожидает', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить занятие' }).click();
  await page.getByRole('button', { name: 'Запросить отмену' }).click();
  await expect(page.getByText('Запрошена отмена', { exact: true })).toBeVisible(); expect(cancellations).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tma-my-bookings.png', fullPage: true });
});
test('server error retains phone and consent, retry uses the same idempotency key', async ({ page }) => {
  await setup(page); const ids: unknown[] = [];
  await page.route('**/api/tma/bookings', route => {
    const body: { requestId: string } = route.request().postDataJSON(); ids.push(body.requestId);
    return route.fulfill(ids.length === 1 ? { status: 503, json: { message: 'Соединение прервано. Повторите запись' } } : { status: 201, json: booking });
  });
  await checkout(page); await page.getByLabel('Телефон', { exact: true }).fill('+79991234567'); await page.getByRole('checkbox').check();
  await advance(page); await expect(page.getByRole('alert')).toContainText('Соединение прервано');
  await expect(page.getByLabel('Телефон', { exact: true })).toHaveValue('+79991234567'); await expect(page.getByRole('checkbox')).toBeChecked();
  await advance(page); await expect(page.getByRole('heading', { name: 'Ждём вас в клубе' })).toBeVisible();
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
});
test('empty slots, loading, error retry, native back and dynamic theme', async ({ page }) => {
  await setup(page); let calls = 0;
  await page.route('**/api/tma/slots?**', async route => {
    calls++; await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill(calls === 1 ? { status: 503, json: { message: 'Нет соединения' } } : { json: { slots: [] } });
  });
  await page.goto(''); await page.getByRole('button', { name: /Первое знакомство 30/ }).focus(); await page.keyboard.press('Enter'); await advance(page);
  await expect(page.getByRole('status')).toContainText('Проверяем');
  await expect(page.getByRole('alert')).toContainText('Нет соединения');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click(); await expect(page.getByText('Свободного времени нет.', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__tmaTest.active())).toBe(false);
  await page.evaluate(() => window.__tmaTest.back()); await expect(page.getByRole('heading', { name: 'Время для лошадей' })).toBeVisible();
  await page.evaluate(() => window.__tmaTest.theme());
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--tma-bg'))).toBe('#f7f4f0');
  expect(await page.evaluate(() => window.__tmaTest.haptics())).toBeGreaterThan(0);
});
test('outside Telegram shows clear entry guidance and makes no unauthenticated API calls', async ({ page }) => {
  let calls = 0;
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('**/api/tma/**', route => { calls++; return route.abort(); });
  await page.goto(''); await expect(page.getByRole('alert')).toContainText('Откройте запись'); expect(calls).toBe(0);
});

test('success tolerates missing relations, uses selected details and starts a fresh booking', async ({ page }) => {
  await setup(page);
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(error.message));
  await page.route('**/api/tma/bookings', route => route.fulfill({ status: 201, json: { id: bookingId, startTime: start } }));
  await checkout(page);
  await page.getByLabel('Телефон', { exact: true }).fill('+79991234567');
  await page.getByRole('checkbox').check(); await advance(page);
  const summary = page.getByRole('region', { name: 'Информация о записи' });
  await expect(summary.getByRole('heading', { name: service.title })).toBeVisible();
  await expect(summary).toContainText('12:00');
  await expect(summary).toContainText('Анна');
  await expect(summary.getByRole('status')).toContainText('Заявка принята, администратор свяжется с вами');
  await page.screenshot({ path: 'test-results/tma-success-safe.png', fullPage: true });
  await summary.getByRole('button', { name: 'Новая запись' }).click();
  await expect(page.getByRole('heading', { name: 'Время для лошадей' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__tmaTest.active())).toBe(false);
  expect(crashes).toEqual([]);
});

test('my bookings sends TMA authorization and renders missing relations, statuses and both date groups', async ({ page }) => {
  await setup(page);
  await page.route('**/api/tma/my-bookings?**', async route => {
    expect(route.request().headers().authorization).toBe('tma signed-data-test');
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ json: { bookings: [
      { ...booking, trainer: null, lesson: { ...booking.lesson, service: null } },
      { ...booking, id: 'confirmed', clientConfirmed: true, lesson: null },
      { ...booking, id: 'cancelled', status: 'cancelled', trainer: null, lesson: null, startTime: '2020-01-01T12:00:00+03:00' },
      { id: 'no-date', status: 'completed' },
    ], hasMore: false } });
  });
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(error.message));
  await page.goto('');
  await page.getByRole('button', { name: 'Мои записи', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Загружаем ваши записи' })).toBeVisible();
  const future = page.getByRole('region', { name: 'Предстоящие тренировки' });
  await expect(future.getByText('Ожидает', { exact: true })).toBeVisible();
  await expect(future.getByText('Подтверждена', { exact: true })).toBeVisible();
  await expect(future.getByText('Тренер: Уточнит администратор')).toBeVisible();
  const past = page.getByRole('region', { name: 'Прошедшие тренировки' });
  await expect(past.getByText('Отменена', { exact: true })).toBeVisible();
  await expect(past.getByText('Дату и время уточнит администратор')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(crashes).toEqual([]);
});

test('my bookings shows errors with retry, empty state and a working booking action', async ({ page }) => {
  await setup(page); let calls = 0;
  await page.route('**/api/tma/my-bookings?**', route => {
    calls++;
    return route.fulfill(calls === 1 ? { status: 503, json: { message: 'Нет соединения' } } : { json: { bookings: [], hasMore: false } });
  });
  await page.goto(''); await page.getByRole('button', { name: 'Мои записи', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Нет соединения');
  await page.getByRole('button', { name: 'Обновить записи' }).click();
  await expect(page.getByText('У вас пока нет активных записей')).toBeVisible();
  await page.getByRole('button', { name: 'Записаться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Время для лошадей' })).toBeVisible();
  expect(calls).toBe(2);
});
