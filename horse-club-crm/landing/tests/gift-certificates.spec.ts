import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`gift certificates fit ${width}px and scroll to the form without clearing its draft`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
    await page.goto('/');
    const section = page.getByRole('region', { name: 'Подарочные сертификаты' });
    await expect(section.locator('ul > li')).toHaveCount(3);
    await expect(section).toContainText('На любую услугу или сумму');
    await expect(section).toContainText('Бумажный или электронный');
    await expect(section).toContainText('Срок действия — 6 месяцев');
    expect(await section.evaluate(element => element.nextElementSibling?.id)).toBe('contacts');
    await section.scrollIntoViewIfNeeded();
    expect(await section.evaluate(element => Array.from(element.querySelectorAll('li, h2, h3, p, a')).every(child => {
      const rect = child.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth && child.scrollWidth <= child.clientWidth;
    }))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`gift-certificates-${width}.png`) });

    await page.getByLabel('Ваше имя').fill('Анна');
    await page.getByLabel('Удобная дата или опыт').fill('Сертификат в подарок');
    const order = section.getByRole('link', { name: 'Заказать сертификат' });
    await order.focus();
    await order.press('Enter');
    await expect(page.locator('#booking-heading')).toBeFocused();
    await expect.poll(async () => page.locator('#booking-form').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight;
    })).toBe(true);
    await expect(page.getByLabel('Ваше имя')).toHaveValue('Анна');
    await expect(page.getByLabel('Удобная дата или опыт')).toHaveValue('Сертификат в подарок');
  });
}

test('certificate order respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
  await page.goto('/');
  await page.getByRole('link', { name: 'Заказать сертификат' }).click();
  await expect(page.locator('#booking-heading')).toBeFocused();
  await expect(page.locator('#booking-form')).toBeInViewport();
});
