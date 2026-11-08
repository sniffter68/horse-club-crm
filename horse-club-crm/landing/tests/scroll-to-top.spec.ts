import { expect, test } from '@playwright/test';

for (const width of [375, 900, 1440]) {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`scroll to top at ${width}px with motion ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.emulateMedia({ reducedMotion });
      await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
      await page.goto('/');
      const button = page.getByRole('button', { name: 'Вернуться наверх', includeHidden: true });
      await expect(button).toBeDisabled();
      await expect(button).toHaveCSS('opacity', '0');
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
      await expect(button).toBeDisabled();
      await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
      await expect(button).toBeEnabled();
      await expect(button).toHaveCSS('opacity', '1');
      const box = (await button.boundingBox())!;
      expect(box.width).toBe(48);
      expect(box.height).toBe(48);
      expect(box.x + box.width).toBeLessThan(width);
      if (width < 1024) {
        const bar = (await page.getByRole('navigation', { name: 'Быстрая запись' }).boundingBox())!;
        expect(box.y + box.height).toBeLessThan(bar.y);
      }
      await button.focus();
      await expect(button).toBeFocused();
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(button).toBeDisabled();
      await expect(button).toHaveCSS('opacity', '0');
    });
  }
}
