import { expect, test } from '@playwright/test';
import { signUpAndSignIn } from './helpers/auth';

test('global Check-ins supports review activity, history, and management', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const goalTitle = `Check-ins QA goal ${suffix}`;

  await signUpAndSignIn(page, 'Check-ins Workspace Tester', `checkins-${suffix}@example.com`);

  await page.goto('/checkins');
  await expect(page.getByRole('heading', { name: 'Check-ins', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No check-ins yet' })).toBeVisible();

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Create new goal' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill(goalTitle);
  await page.getByLabel('Description', { exact: true }).fill('Check-in history relationship test goal.');
  await page.getByRole('button', { name: 'Create Goal' }).click();
  await expect(page.getByRole('link', { name: goalTitle, exact: true }).first()).toBeVisible();

  await page.goto('/checkins');
  await page.getByRole('button', { name: 'Check in', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Daily Check-in' })).toBeVisible();
  await expect(page.getByLabel('Date')).toBeFocused();
  await page.getByLabel('Goal (optional)').selectOption({ label: goalTitle });
  await page.getByLabel('Accomplishment 1').fill('Reviewed the current execution plan');
  await page.getByLabel('Challenge 1').fill('Waiting for one user response');
  await page.getByLabel('Goal 1').fill('Follow up with the first beta user');
  await page.getByLabel('Notes').fill('Keep the next review focused.');
  await page.getByRole('button', { name: 'Submit check-in' }).click();

  await expect(page.locator('#recent-check-ins').getByText('Reviewed the current execution plan', { exact: true })).toBeVisible();
  await expect(page.locator('#recent-check-ins').getByText(goalTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review activity' })).toBeVisible();

  const activity = page.locator('section[aria-labelledby="review-activity-heading"]');
  const emptyDay = activity.locator('button[aria-label*="no check-in"]').first();
  await emptyDay.click();
  await expect(activity.getByText(/^No check-in on /)).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Check in', exact: true })).toBeVisible();

  const checkedDay = activity.locator('button[aria-label*="check-in"]').first();
  await checkedDay.focus();
  await expect(checkedDay).toHaveAttribute('aria-label', /check-in/);
  await checkedDay.press('Enter');
  await expect(activity.getByText(/mood/).first()).toBeVisible();

  const historyItem = page.locator('article').filter({ hasText: 'Reviewed the current execution plan' });
  await historyItem.getByRole('button', { name: /Actions for check-in on/ }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Check-in' })).toBeVisible();
  await page.getByLabel('Accomplishment 1').fill('Reviewed and updated the execution plan');
  await page.getByRole('button', { name: 'Save check-in changes' }).click();
  await expect(page.locator('#recent-check-ins').getByText('Reviewed and updated the execution plan', { exact: true })).toBeVisible();

  const updatedHistoryItem = page.locator('article').filter({ hasText: 'Reviewed and updated the execution plan' });
  await updatedHistoryItem.getByRole('button', { name: /Actions for check-in on/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete the check-in from');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#recent-check-ins').getByText('Reviewed and updated the execution plan', { exact: true })).toBeVisible();

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/checkins');
    await expect(page.getByRole('heading', { name: 'Review activity' })).toBeVisible();
    await expect(page.getByText('Reviewed and updated the execution plan', { exact: true }).last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.width <= 390) {
      await page.getByRole('button', { name: 'View full year' }).click();
      await expect(page.getByRole('button', { name: 'Show recent 12 weeks' })).toBeVisible();
    }
  }

  await updatedHistoryItem.getByRole('button', { name: /Actions for check-in on/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete check-in' }).click();
  await expect(page.getByRole('heading', { name: 'No check-ins yet' })).toBeVisible();

});
