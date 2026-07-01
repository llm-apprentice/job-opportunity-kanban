import { test, expect } from '@playwright/test';

test('drag-selects multiple cards and bulk deletes them in demo mode', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.card')).toHaveCount(4);

  const first = page.locator('.card').nth(0);
  const second = page.locator('.card').nth(1);
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();

  // Hold Option/Alt and drag a lasso over the first two cards. This is faster than ticking boxes.
  await page.keyboard.down('Alt');
  await page.mouse.move(a.x - 12, a.y - 12);
  await page.mouse.down();
  await page.mouse.move(Math.max(a.x + a.width, b.x + b.width) + 12, Math.max(a.y + a.height, b.y + b.height) + 12, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');

  await expect(page.locator('.card.selected')).toHaveCount(2);
  await expect(page.locator('#bulkBar')).toContainText('2 selected');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#bulkDelete').click();

  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('#bulkBar')).toBeHidden();
});
