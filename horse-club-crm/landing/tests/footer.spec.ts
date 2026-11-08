import { expect, test } from '@playwright/test';

for (const [width, columns] of [[320, 1], [640, 2], [900, 3], [1440, 5]] as const) {
  test(`footer layout and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
    await page.goto('/');
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    expect(await footer.locator(':scope > div').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(columns);
    for (const link of await footer.getByRole('link').all()) {
      const box = (await link.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(footer.getByRole('link', { name: 'MAX', exact: true })).toHaveAttribute('href', 'https://max.ru/join/Evl2Mp0moqVwQAeBIPaY5ozOrE6rs83dO45_5SrqAvo');
    await expect(footer.getByRole('link', { name: 'Отзывы', exact: true })).toHaveAttribute('href', 'https://vk.ru/reviews-226780791');
    const policy = footer.getByRole('link', { name: 'Политика конфиденциальности' });
    await policy.click();
    await expect(page.getByRole('dialog')).toContainText('152-ФЗ');
    await page.keyboard.press('Escape');
    await expect(policy).toBeFocused();
    await footer.getByRole('link', { name: 'Тренеры', exact: true }).click();
    await expect(page.locator('#trainers')).toHaveAttribute('aria-pressed', 'true');
    await footer.getByRole('link', { name: 'Лошади', exact: true }).click();
    await expect(page.locator('#horses')).toHaveAttribute('aria-pressed', 'true');
    await footer.scrollIntoViewIfNeeded();
    await footer.screenshot({ path: test.info().outputPath(`footer-${width}.png`) });
  });
}
