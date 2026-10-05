import { expect, test } from '@playwright/test';
import { signUpAndSignIn } from './helpers/auth';

test('global Notes supports capture, retrieval, pinning, editing, and deletion', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const firstTitle = `Launch notes ${suffix}`;
  const secondTitle = `Reference notes ${suffix}`;

  await signUpAndSignIn(page, 'Notes Workspace Tester', `notes-${suffix}@example.com`);

  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No notes yet' })).toBeVisible();

  await page.getByRole('button', { name: 'New note', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Create New Note' })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  await page.getByLabel('Title', { exact: true }).fill(firstTitle);
  await page.getByLabel('Content (Markdown supported)', { exact: true }).fill('OAuth launch requirements and the next review.');
  await page.getByLabel('Category (optional)', { exact: true }).fill('Planning');
  await page.getByRole('checkbox', { name: 'Pin this note' }).check();
  await page.getByRole('button', { name: 'Create new note' }).click();
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pinned', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New note', exact: true }).first().click();
  await page.getByLabel('Title', { exact: true }).fill(secondTitle);
  await page.getByLabel('Content (Markdown supported)', { exact: true }).fill('A multiline reference note.\n\nKeep this searchable.');
  await page.getByLabel('Category (optional)', { exact: true }).fill('Reference');
  await page.getByRole('button', { name: 'Create new note' }).click();
  await expect(page.getByText(secondTitle, { exact: true })).toBeVisible();

  const secondRow = page.locator('article').filter({ hasText: secondTitle });
  await secondRow.getByRole('button', { name: `Actions for ${secondTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Pin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pinned', exact: true })).toBeVisible();

  await page.getByLabel('Search notes').fill('searchable');
  await expect(page.getByText(secondTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(firstTitle, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).first().click();

  await page.getByLabel('Category').selectOption({ label: 'Planning' });
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(secondTitle, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).first().click();

  const firstRow = page.locator('article').filter({ hasText: firstTitle });
  await firstRow.getByRole('button', { name: `Actions for ${firstTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit Note' })).toBeVisible();
  await page.getByLabel('Content (Markdown supported)', { exact: true }).fill('Updated launch requirements.');
  await page.getByRole('button', { name: 'Save note changes' }).click();
  await expect(page.getByText('Updated launch requirements.', { exact: true })).toBeVisible();

  await firstRow.getByRole('button', { name: `Actions for ${firstTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Unpin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pinned', exact: true })).toBeVisible();

  await secondRow.getByRole('button', { name: `Actions for ${secondTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText(`Delete “${secondTitle}”?`);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(secondTitle, { exact: true })).toBeVisible();

  await secondRow.getByRole('button', { name: `Actions for ${secondTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await expect(page.getByText(secondTitle, { exact: true })).toHaveCount(0);

  await page.getByLabel('Search notes').fill('no-note-matches-this');
  await expect(page.getByRole('heading', { name: 'No matching notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/notes');
    await expect(page.getByRole('heading', { name: 'Notes', level: 1, exact: true })).toBeVisible();
    await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
  }
});
