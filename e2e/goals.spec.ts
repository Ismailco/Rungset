import { expect, test } from '@playwright/test';
import { signUpAndSignIn } from './helpers/auth';

test('Goals overview keeps filtering and management actions available', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  await signUpAndSignIn(page, 'Goals Overview Tester', `goals-${suffix}@example.com`);

  await page.getByRole('link', { name: 'Goals', exact: true }).first().click();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(page.getByRole('heading', { name: 'Goals', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No goals yet' })).toBeVisible();

  await page.getByRole('button', { name: 'Goal ideas', exact: true }).click();
  const ideasDialog = page.getByRole('dialog', { name: 'Goal ideas' });
  await expect(ideasDialog).toBeVisible();
  await expect(ideasDialog.getByRole('button', { name: 'Add goal', exact: true }).first()).toBeVisible();
  await ideasDialog.getByRole('button', { name: 'Add goal', exact: true }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Goal added' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Daily Exercise Routine', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Create new goal' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Ship the first release');
  await page.getByLabel('Description', { exact: true }).fill('Validate the product with early users.');
  await page.getByLabel('Category', { exact: true }).selectOption('career');
  await page.getByRole('button', { name: 'Create Goal' }).click();
  await expect(page.getByRole('link', { name: 'Ship the first release', exact: true })).toBeVisible();

  await page.getByLabel('Search goals').fill('early users');
  await expect(page.getByRole('link', { name: 'Ship the first release', exact: true })).toBeVisible();
  await page.getByLabel('Filter by category').selectOption('health');
  await expect(page.getByRole('heading', { name: 'No matching goals' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: 'Ship the first release', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Ship the first release' }).click();
  await page.getByRole('menuitem', { name: 'Edit goal: Ship the first release' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Ship the first release' })).toBeVisible();
  await page.getByLabel('Description', { exact: true }).fill('Updated execution description.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Updated execution description.')).toBeVisible();

  await page.getByRole('link', { name: 'Ship the first release', exact: true }).click();
  await expect(page).toHaveURL(/\/goals\//);
  await expect(page.getByRole('heading', { name: 'Ship the first release' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/goals$/);

  await page.getByRole('button', { name: 'Actions for Ship the first release' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete Ship the first release?');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name: 'Ship the first release', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Ship the first release' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete goal' }).click();
  await expect(page.getByRole('link', { name: 'Daily Exercise Routine', exact: true })).toBeVisible();
});
