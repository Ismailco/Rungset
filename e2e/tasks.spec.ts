import { expect, test } from '@playwright/test';
import { signUpAndSignIn } from './helpers/auth';

function dateOnly(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('global Tasks supports finding, grouping, managing, and completing work', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const goalTitle = `Tasks QA goal ${suffix}`;

  await signUpAndSignIn(page, 'Tasks Workspace Tester', `tasks-${suffix}@example.com`);

  await page.getByRole('button', { name: 'Create new goal' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill(goalTitle);
  await page.getByLabel('Description', { exact: true }).fill('Tasks page relationship test goal.');
  await page.getByRole('button', { name: 'Create Goal' }).click();
  await page.getByRole('link', { name: goalTitle, exact: true }).first().click();
  await expect(page).toHaveURL(/\/goals\//);

  await page.getByRole('button', { name: 'Add milestone', exact: true }).last().click();
  await page.getByLabel('Title', { exact: true }).fill('Tasks QA milestone');
  await page.getByLabel('Description', { exact: true }).fill('Milestone for global task context.');
  await page.getByLabel('Target Date').fill(dateOnly(14));
  await page.getByRole('button', { name: 'Create Milestone' }).click();
  await expect(page.getByText('Tasks QA milestone')).toBeVisible();

  await page.goto('/todos');
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(page.getByText('Manage work across your goals.')).toBeVisible();

  await page.getByRole('button', { name: 'New task' }).first().click();
  await page.getByLabel('Title', { exact: true }).fill('Overdue standalone task');
  await page.getByLabel('Due Date (optional)').fill(dateOnly(-2));
  await page.getByLabel('Select task priority').selectOption('high');
  await page.getByRole('button', { name: 'Create new task' }).click();
  await expect(page.getByRole('heading', { name: 'Overdue', exact: true })).toBeVisible();
  await expect(page.getByText('Overdue ·')).toBeVisible();

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Linked milestone task');
  await page.getByLabel('Due Date (optional)').fill(dateOnly(0));
  await page.getByLabel('Goal (optional)').selectOption({ label: goalTitle });
  await page.getByLabel('Milestone (optional)').selectOption({ label: 'Tasks QA milestone' });
  await page.getByRole('button', { name: 'Create new task' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: goalTitle, exact: true })).toBeVisible();
  await expect(page.getByText('Tasks QA milestone', { exact: true })).toBeVisible();

  await page.getByLabel('Search tasks').fill(goalTitle);
  await expect(page.getByText('Linked milestone task', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear task search' }).click();

  await page.getByLabel('Filter tasks by goal').selectOption({ label: 'Standalone tasks' });
  await expect(page.getByText('Overdue standalone task', { exact: true })).toBeVisible();
  await expect(page.getByText('Linked milestone task', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await page.getByLabel('Filter tasks by priority').selectOption('high');
  await expect(page.getByText('Overdue standalone task', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await page.getByRole('button', { name: 'Mark Overdue standalone task complete' }).click();
  await expect(page.getByText('Overdue standalone task', { exact: true })).not.toBeVisible();
  await page.getByLabel('Filter tasks by status').selectOption('completed');
  await expect(page.getByText('Overdue standalone task', { exact: true })).toBeVisible();
  await page.getByLabel('Filter tasks by status').selectOption('all');

  const linkedRow = page.locator('article').filter({ hasText: 'Linked milestone task' });
  await linkedRow.getByRole('button', { name: /Actions for Linked milestone task/ }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Task' })).toBeVisible();
  await page.getByLabel('Select task priority').selectOption('high');
  await page.getByRole('button', { name: 'Save task changes' }).click();
  await expect(linkedRow.getByText('High', { exact: true })).toBeVisible();

  await page.getByLabel('Filter tasks by status').selectOption('all');
  const overdueRow = page.locator('article').filter({ hasText: 'Overdue standalone task' });
  await overdueRow.getByRole('button', { name: /Actions for Overdue standalone task/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete “Overdue standalone task”?');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Overdue standalone task', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Actions for Overdue standalone task/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete task' }).click();
  await expect(page.getByText('Overdue standalone task', { exact: true })).not.toBeVisible();

  await page.goto('/settings');
  const showCompletedByDefault = page.getByRole('switch', { name: 'Show completed tasks by default' });
  await showCompletedByDefault.click();
  await expect(showCompletedByDefault).toHaveAttribute('aria-checked', 'true');
  await page.goto('/todos');
  await expect(page.getByLabel('Filter tasks by status')).toHaveValue('all');

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/todos');
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/todos');
  await page.getByRole('button', { name: 'New task' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  const dialog = page.getByRole('heading', { name: 'Create New Task' }).locator('..').locator('..');
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width ?? 0).toBeLessThanOrEqual(360);
  expect(dialogBox?.height ?? 0).toBeLessThanOrEqual(800);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Create New Task' })).not.toBeVisible();
});
