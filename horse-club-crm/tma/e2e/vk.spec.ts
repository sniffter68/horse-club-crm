import { test, expect } from '@playwright/test';

test('VK client links in one form and opens the dashboard', async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    window.addEventListener('message', event => {
      const message: unknown = event.data;
      if (!message || typeof message !== 'object' || !('handler' in message) || message.handler !== 'VKWebAppInit' || !('params' in message)) return;
      window.postMessage({ type: 'VKWebAppInitResult', data: message.params }, '*');
    });
  });
  await page.route('**/api/auth/vk-mini-app', route => route.fulfill({ json: { status: 'UNLINKED', vkUserId: '123' } }));
  await page.route('**/api/auth/vk-mini-app/link', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ phone: '+79991234567', code: '1234' });
    await route.fulfill({ json: { status: 'LINKED', role: 'CLIENT', access_token: 'vk-token', clientId: '11111111-1111-4111-8111-111111111111' } });
  });
  await page.route('**/api/tma/client/overview', route => route.fulfill({ json: {
    client: { id: '11111111-1111-4111-8111-111111111111', name: 'Анна', firstName: 'Анна', lastName: '', phone: '+79991234567' }, membership: null, bookings: [],
  } }));
  await page.goto('/tma/?vk_user_id=123&sign=test');
  await expect(page.getByRole('heading', { name: 'Привязка кабинета' })).toBeVisible();
  await page.getByLabel('Телефон', { exact: true }).fill('+79991234567');
  await page.getByLabel('Код привязки').fill('1234');
  await page.getByRole('button', { name: 'Привязать кабинет' }).click();
  await expect(page.getByRole('heading', { name: 'Привязка кабинета' })).not.toBeVisible();
  await expect(page.getByText('Анна', { exact: true })).toBeVisible();
});
