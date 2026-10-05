import { expect, test } from '@playwright/test';
import { signUpAndSignIn } from './helpers/auth';

test('local workspace data is cleared across account transitions', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await signUpAndSignIn(page, 'Cache Owner A', `cache-a-${suffix}@example.com`);

  await page.getByRole('button', { name: 'Create new goal' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Private goal for account A');
  await page.getByLabel('Description', { exact: true }).fill('This must not survive an account transition.');
  await page.getByRole('button', { name: 'Create Goal' }).click();
  await expect(page.getByText('Private goal for account A').first()).toBeVisible();

  const accountAStorage = await page.evaluate(() => {
    const userId = localStorage.getItem('userId');
    return {
      userId,
      goalCache: userId ? localStorage.getItem(`goals:${userId}`) : null,
    };
  });
  expect(accountAStorage.userId).toBeTruthy();
  expect(accountAStorage.goalCache).toContain('Private goal for account A');

  await page.getByRole('button', { name: /Open user menu/i }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/auth\/signin/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('userId'))).toBeNull();
  expect(await page.evaluate((userId) => localStorage.getItem(`goals:${userId}`), accountAStorage.userId)).toBeNull();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/auth\/signin/);

  await signUpAndSignIn(page, 'Cache Owner B', `cache-b-${suffix}@example.com`);
  expect(await page.evaluate(() => localStorage.getItem('userId'))).not.toBe(accountAStorage.userId);
  await expect(page.getByText('Private goal for account A')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
});
