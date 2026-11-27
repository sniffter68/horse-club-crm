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
  await page.goto('/tma/?vk_user_id=123&sign=test');
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
  let calls = 0;
  await page.route('**/api/auth/vk-mini-app', route => { calls++; return route.fulfill({ json: calls === 1 ? { status: 'UNLINKED', vkUserId: '123' } : { status: 'LINKED', role: 'MANAGER', access_token: 'staff-token' } }); });
  await page.route('**/api/auth/vk-mini-app/link-by-vk', () => { throw new Error('No phone consent'); });
  await page.goto('/tma/?vk_user_id=123&sign=test');
  await page.getByRole('button', { name: 'Привязать по номеру ВК' }).click();
  await expect(page.getByRole('alert')).toContainText('VK не передал номер');
  await expect(page.getByText('VK ID: 123', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить вход' }).click();
  await expect(page.getByRole('heading', { name: 'Кабинет сотрудника' })).toBeVisible();
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
  await page.goto('/tma/?vk_user_id=123&sign=test');
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

test('VK existing identity logs in directly for staff', async ({ page }) => {
  await mockBridge(page);
  await page.route('**/api/auth/vk-mini-app', route => route.fulfill({ json: { status: 'LINKED', role: 'MANAGER', access_token: 'staff-token' } }));
  await page.goto('/tma/?vk_user_id=123&sign=test');
  await expect(page.getByRole('heading', { name: 'Кабинет сотрудника' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть CRM' })).toHaveAttribute('href', 'https://crm.horseclub68.ru');
  await expect(page.getByRole('textbox')).toHaveCount(0);
});
