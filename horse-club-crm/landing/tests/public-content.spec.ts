import { expect, test } from '@playwright/test';

const content = {
  horses: [{ id: 'horse-1', name: 'Лошадь из CRM', breed: 'Орловская', role: 'Для начинающих', description: 'Описание лошади из базы', imageUrl: null }],
  trainers: [{ id: 'trainer-1', name: 'Тренер из CRM', role: 'Инструктор', description: 'Биография из базы', qualification: 'КМС', specializations: ['Конкур'], imageUrl: null }],
  services: [{ id: 'service-1', name: 'Услуга из CRM', title: 'Занятие из CRM', price: '1250.50', durationMinutes: 45, description: 'Описание услуги из базы', imageUrl: null }],
};

test('loads public records, updates service selection and opens real horse/trainer details', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/public/content', async route => { await pending; await route.fulfill({ json: content }); });
  await page.goto('/');
  await expect(page.locator('#services').getByRole('button').first()).toBeVisible();
  release();
  await expect(page.locator('#services').getByRole('button', { name: 'Занятие из CRM' })).toBeVisible();
  await expect(page.locator('#services')).toContainText('Описание услуги из базы');
  await expect(page.locator('#services')).toContainText('45 мин');
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Лошадь из CRM' }) }).click();
  await expect(page.getByRole('dialog')).toContainText('Описание лошади из базы');
  await page.keyboard.press('Escape');
  await page.locator('#horses-trainers').getByRole('button', { name: 'Тренеры', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Тренер из CRM' }) }).click();
  await expect(page.getByRole('dialog')).toContainText('Биография из базы');
  await expect(page.getByRole('dialog')).toContainText('КМС');
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: test.info().outputPath('public-trainer.png') });
});

for (const scenario of ['empty', 'error', 'malformed', 'partial']) {
  test(`renders defaults for ${scenario} content at mobile width`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/public/content', route => route.fulfill({
      status: scenario === 'error' ? 503 : 200,
      json: scenario === 'malformed' ? { horses: [null], services: 'invalid' }
        : scenario === 'partial' ? { ...content, horses: [], trainers: [] }
        : { horses: [], trainers: [], services: [] },
    }));
    await page.goto('/');
    await expect(page.locator('#horses-trainers h3').first()).toBeVisible();
    await expect(page.locator('#services').getByRole('button').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Лошадь из CRM' })).toHaveCount(0);
    if (scenario === 'partial') await expect(page.locator('#services')).toContainText('Занятие из CRM');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
