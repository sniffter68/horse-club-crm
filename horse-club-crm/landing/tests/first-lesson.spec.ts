import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`first lesson fits ${width}px and links to booking without clearing input`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
    await page.goto('/');
    const section = page.locator('#first-lesson');
    await expect(section.locator('ol > li')).toHaveCount(4);
    await expect(section.locator('dl > div')).toHaveCount(3);
    expect(await section.evaluate(element => element.nextElementSibling?.id)).toBe('gift-certificates');
    await section.scrollIntoViewIfNeeded();
    const bounds = await section.locator('ol').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    // The carousel deliberately clips slides; other content must fit the document.
    expect(await section.evaluate(element => Array.from(element.querySelectorAll('dt, dd, h2, a')).every(child => {
      const rect = child.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth && child.scrollWidth <= child.clientWidth;
    }))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`first-lesson-${width}.png`) });

    await page.getByLabel('Ваше имя').fill('Анна');
    await page.getByLabel('Удобная дата или опыт').fill('Хочу попробовать впервые');
    await section.getByRole('link', { name: 'Записаться на первое занятие' }).click();
    await expect(page.locator('#booking-heading')).toBeFocused();
    await expect.poll(async () => page.locator('#booking-form').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight;
    })).toBe(true);
    await expect(page.getByLabel('Ваше имя')).toHaveValue('Анна');
    await expect(page.getByLabel('Удобная дата или опыт')).toHaveValue('Хочу попробовать впервые');
  });
}
