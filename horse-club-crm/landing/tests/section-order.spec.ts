import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  test(`section order and navigation targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
    await page.goto('/');
    const ids = ['hero', 'about', 'services', 'horses', 'coaches', 'preparation', 'reviews', 'faq', 'contacts'];
    expect(await page.locator('main section[id]').evaluateAll(sections => sections.map(section => section.id)
      .filter(id => !['gift-certificates'].includes(id)))).toEqual(ids);
    for (const id of [...ids, 'booking']) {
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
    for (const id of ids.slice(1).concat('booking')) {
      const link = page.locator(`footer a[href="#${id}"]`).first();
      await link.click();
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await expect(page.locator('#reviews a')).toHaveAttribute('href', 'https://vk.ru/reviews-226780791');
    expect(await page.locator('nav a[href^="#"]').evaluateAll(links => links.every(link => {
      const href = link.getAttribute('href');
      return href !== null && document.getElementById(href.slice(1)) !== null;
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`section-order-${width}.png`), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
  });
}
