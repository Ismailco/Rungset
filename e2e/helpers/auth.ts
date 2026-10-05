import { expect, type Page } from "@playwright/test";

const TEST_PASSWORD = "Rungset-e2e-2026";
const SIGN_UP_NOTICE = "If an account can be created with these details, you can now sign in.";

export async function finishSignUpAndSignIn(page: Page, name: string, email: string) {
  await page.getByLabel("Full Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirm Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(SIGN_UP_NOTICE);

  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

export async function signUpAndSignIn(page: Page, name: string, email: string) {
  await page.goto("/auth/signup");
  await finishSignUpAndSignIn(page, name, email);
}
