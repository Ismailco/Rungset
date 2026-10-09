import { expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";

const TEST_PASSWORD = "Rungset-e2e-2026";
const SIGN_UP_NOTICE = "If an account can be created with these details, a verification email has been sent. Verify your email before signing in.";

export function markTestEmailVerified(email: string) {
  const persistDir = process.env.RUNGSET_E2E_PERSIST_DIR;
  if (!persistDir) throw new Error("The local E2E database directory is unavailable.");

  const escapedEmail = email.replace(/'/g, "''");
  const result = spawnSync("pnpm", [
    "exec", "wrangler", "d1", "execute", "goalgenius_db", "--local",
    "--persist-to", persistDir, "--config", "wrangler.jsonc",
    "--command", `UPDATE user SET email_verified = 1 WHERE email = '${escapedEmail}'`,
  ], { cwd: process.cwd(), env: process.env, encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`Could not verify the local E2E account: ${result.stderr || result.stdout}`);
  }
}

export async function finishSignUpAndSignIn(page: Page, name: string, email: string) {
  await page.getByLabel("Full Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirm Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(SIGN_UP_NOTICE);
  markTestEmailVerified(email);

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
