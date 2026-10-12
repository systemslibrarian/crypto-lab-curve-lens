import { test, expect } from '@playwright/test';
test('research boundary is visible in the rendered lesson', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-scalar-mode="real"]').click();
  await expect(page.locator('#real-scalar-steps')).toContainText('Public parameter size');
  await expect(page.locator('#real-scalar-steps')).not.toContainText('ladder iterations');
});
