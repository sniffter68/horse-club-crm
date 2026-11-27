import { test, expect, type Page } from '@playwright/test';

async function mockBridge(page: Page, denied = false) {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.addInitScript(({ denied }) => {
    window.addEventListener('message', event => {
      const message: unknown = event.data;
      if (!message || typeof message !== 'object' || !('handler' in message) || !('params' in message)) return;
      const params = message.params && typeof message.params === 'object' ? message.params : {};
      if (message.handler === 'VKWebAppInit') window.postMessage({ type: 'VKWebAppInitResult', data: params }, '*');
      if (message.handler === 'VKWebAppGetPhoneNumber') window.postMessage(denied
        ? { type: 'VKWebAppGetPhoneNumberFailed', data: { ...params, error_type: 'client_error', error_data: { error_code: 4, error_reason: 'Denied' } } }
        : { type: 'VKWebAppGetPhoneNumberResult', data: { ...params, phone_number: '79991234567', sign: 'native-proof' } }, '*');
      if (message.handler === 'VKWebAppCopyText') window.postMessage({ type: 'VKWebAppCopyTextResult', data: { ...params, result: true } }, '*');
    });
  }, { denied });
}

const staff = (role = 'MANAGER', accessLevel = 'FULL') => ({ status: 'LINKED', role, miniAppRole: role === 'MANAGER' ? 'STAFF' : role, token: 'scoped-staff-token', access_token: 'crm-token', trainerId: role === 'TRAINER' ? '22222222-2222-4222-8222-222222222222' : null, accessLevel, user: { id: 'staff', name: 'Сотрудник клуба' } });
async function mockSchedule(page: Page) {
  await page.route('**/api/tma/**', route => {
    expect(route.request().headers().authorization).toBe('Bearer scoped-staff-token');
    return route.fulfill({ json: [] });
  });
}

const linked = { status: 'LINKED', role: 'CLIENT', access_token: 'vk-token', clientId: '11111111-1111-4111-8111-111111111111' };

test('VK native phone links without input and opens the dashboard', async ({ page }) => {
  await mockBridge(page);
  await page.route('**/api/auth/vk-mini-app', route => route.fulfill({ json: { status: 'UNLINKED', vkUserId: '123' } }));
  await page.route('**/api/auth/vk-mini-app/link-by-vk', async route => {
    expect(route.request().postDataJSON()).toEqual({ launchParams: '?vk_user_id=123&sign=test', phone: '79991234567', phoneToken: 'native-proof' });
    await route.fulfill({ json: linked });
  });
  await page.route('**/api/tma/client/overview', route => route.fulfill({ json: {
    client: { id: '11111111-1111-4111-8111-111111111111', name: 'Анна', firstName: 'Анна', lastName: '', phone: '+79991234567' }, membership: null, bookings: [],
  } }));
  await page.goto('/vk-app/?vk_user_id=123&sign=test');
  await expect(page.getByRole('heading', { name: 'Привязка кабинета' })).toBeVisible();
  await expect(page.getByText('VK ID: 123', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Скопировать ID' }).click();
  await expect(page.getByRole('status')).toHaveText('VK ID скопирован');
  await page.getByRole('button', { name: 'Привязать по номеру ВК' }).click();
  await expect(page.getByRole('heading', { name: 'Привязка кабинета' })).not.toBeVisible();
  await expect(page.getByText('Анна', { exact: true })).toBeVisible();
});

test('VK consent refusal keeps ID and allows repeated login', async ({ page }) => {
  await mockBridge(page, true);
  await mockSchedule(page);
  let calls = 0;
  await page.route('**/api/auth/vk-mini-app', route => { calls++; return route.fulfill({ json: calls === 1 ? { status: 'UNLINKED', vkUserId: '123' } : staff() }); });
  await page.route('**/api/auth/vk-mini-app/link-by-vk', () => { throw new Error('No phone consent'); });
  await page.goto('/vk-app/?vk_user_id=123&sign=test');
  await page.getByRole('button', { name: 'Привязать по номеру ВК' }).click();
  await expect(page.getByRole('alert')).toContainText('VK не передал номер');
  await expect(page.getByText('VK ID: 123', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить вход' }).click();
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible();
});

test('VK displays CRM errors, pending state and keyboard recovery', async ({ page }) => {
  await mockBridge(page);
  await page.route('**/api/auth/vk-mini-app', route => route.fulfill({ json: { status: 'UNLINKED', vkUserId: '123' } }));
  let calls = 0;
  await page.route('**/api/auth/vk-mini-app/link-by-vk', async route => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status: 409, json: { message: 'Номер указан в нескольких профилях. Обратитесь к администратору' } });
  });
  await page.goto('/vk-app/?vk_user_id=123&sign=test');
  await page.getByRole('button', { name: 'Привязать по номеру ВК' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Привязываем…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Повторить вход' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Номер указан в нескольких профилях');
  expect(calls).toBe(1);
  await page.screenshot({ path: '../docs/reports/vk-native-phone-mobile.png' });
  await page.getByRole('button', { name: 'Привязать по номеру ВК' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => calls).toBe(2);
});

for (const role of ['CLIENT', 'TRAINER', 'ADMIN', 'MANAGER']) {
  for (const link of [false, true]) {
    test(`VK ${role} opens its workspace inside Mini App after ${link ? 'phone link' : 'login'}`, async ({ page, context }) => {
      await mockBridge(page);
      await mockSchedule(page);
      let authenticated = !link;
      await page.route('**/api/auth/vk-mini-app', route => route.fulfill({ json: authenticated ? role === 'CLIENT' ? linked : staff(role) : { status: 'UNLINKED', vkUserId: '123' } }));
      await page.route('**/api/auth/vk-mini-app/link-by-vk', route => {
        authenticated = true;
        return route.fulfill({ json: role === 'CLIENT' ? linked : staff(role) });
      });
      await page.route('**/api/tma/client/overview', route => {
        expect(route.request().headers().authorization).toBe('Bearer vk-token');
        return route.fulfill({ json: { client: { id: linked.clientId, name: 'Анна', firstName: 'Анна', lastName: '', phone: null }, membership: null, bookings: [] } });
      });
      await page.goto('/vk-app/?vk_user_id=123&sign=test');
      if (link) await page.getByRole('button', { name: 'Привязать по номеру ВК' }).click();
      await expect(page.getByRole('heading', { name: role === 'CLIENT' ? 'Кабинет всадника' : role === 'TRAINER' ? 'Моё расписание' : 'Расписание клуба', exact: true })).toBeVisible();
      if (role !== 'CLIENT') await expect(page.getByText('На этот день занятий нет')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Открыть CRM' })).toHaveCount(0);
      await expect(page.getByText('Кабинет сотрудника', { exact: true })).toHaveCount(0);
      expect(new URL(page.url()).pathname.startsWith('/vk-app/')).toBe(true);
      expect(context.pages()).toHaveLength(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (!link) await page.screenshot({ path: `test-results/vk-${role.toLowerCase()}.png`, fullPage: true });
    });
  }
}

test('VK read-only staff hides mutations and recovers from expired session', async ({ page }) => {
  await mockBridge(page);
  await page.route('**/api/auth/vk-mini-app', route => route.fulfill({ json: staff('MANAGER', 'READ_ONLY') }));
  let expired = true;
  await page.route('**/api/tma/**', route => {
    expect(route.request().headers().authorization).toBe('Bearer scoped-staff-token');
    return route.fulfill(expired ? { status: 401, json: { message: 'Сессия истекла' } } : { json: [] });
  });
  await page.goto('/vk-app/?vk_user_id=123&sign=test');
  await expect(page.getByText('Сессия истекла. Повторите вход через VK')).toBeVisible();
  expired = false;
  await page.getByRole('button', { name: 'Повторить вход' }).click();
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible();
  await expect(page.getByText('Время московское · Только просмотр')).toBeVisible();
  await expect(page.getByRole('button', { name: /Записать|Проведено|Неявка/ })).toHaveCount(0);
});

for (const role of ['CLIENT', 'TRAINER', 'ADMIN']) {
  test(`VK ${role} works across the production origins without a cookie session`, async ({ page, baseURL, context }) => {
    await mockBridge(page);
    // Serve the built artifacts under their deployment URL; API calls must use the other origin.
    await page.route('https://horseclub68.ru/vk-app/**', async route => {
      const url = new URL(route.request().url());
      const local = new URL(`${url.pathname}${url.search}`, baseURL);
      const response = await route.fetch({ url: local.href });
      await route.fulfill({ response });
    });
    const cors = { 'Access-Control-Allow-Origin': 'https://horseclub68.ru', 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST,GET,PATCH,OPTIONS' };
    let reads = 0;
    await page.route('https://crm.horseclub68.ru/api/**', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/vk-mini-app') return route.fulfill({ headers: cors, json: role === 'CLIENT' ? linked : staff(role) });
      expect(route.request().headers().authorization).toBe(`Bearer ${role === 'CLIENT' ? 'vk-token' : 'scoped-staff-token'}`);
      reads++;
      return route.fulfill({ headers: cors, json: role === 'CLIENT'
        ? { client: { id: linked.clientId, name: 'Анна', phone: null }, membership: null, bookings: [] } : [] });
    });
    await page.goto('https://horseclub68.ru/vk-app/?vk_user_id=123&sign=test');
    await expect(page.getByRole('heading', { name: role === 'CLIENT' ? 'Кабинет всадника' : role === 'TRAINER' ? 'Моё расписание' : 'Расписание клуба', exact: true })).toBeVisible();
    await expect.poll(() => reads).toBeGreaterThan(0);
    expect(await context.cookies()).toHaveLength(0);
    expect(new URL(page.url()).origin).toBe('https://horseclub68.ru');
  });
}

test('VK trainer marks attendance with the scoped Bearer session', async ({ page }) => {
  await mockBridge(page);
  await page.route('**/api/auth/vk-mini-app', route => route.fulfill({ json: staff('TRAINER') }));
  let completed = false;
  await page.route('**/api/tma/**', route => {
    expect(route.request().headers().authorization).toBe('Bearer scoped-staff-token');
    if (route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ status: 'COMPLETED' });
      completed = true;
      return route.fulfill({ json: { updated: true } });
    }
    return route.fulfill({ json: [{ id: linked.clientId, startTime: '2026-11-27T09:00:00Z', endTime: '2026-11-27T10:00:00Z',
      status: completed ? 'COMPLETED' : 'SCHEDULED', serviceName: 'Индивидуальное занятие', clientName: 'Анна Всадник',
      horseId: null, horseName: null, notes: null, participants: [] }] });
  });
  await page.goto('/vk-app/?vk_user_id=123&sign=test');
  await page.getByRole('button', { name: 'Проведено', exact: true }).click();
  await expect.poll(() => completed).toBe(true);
  await expect(page.getByRole('button', { name: 'Проведено', exact: true })).toHaveCount(0);
  await expect(page.getByText('Проведено', { exact: true })).toBeVisible();
});
