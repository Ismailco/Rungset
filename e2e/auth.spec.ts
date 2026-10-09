import { expect, test, type Page } from '@playwright/test';
import { markTestEmailVerified } from './helpers/auth';

const TEST_PASSWORD = "Rungset-e2e-2026";
const SIGN_UP_NOTICE = "If an account can be created with these details, a verification email has been sent. Verify your email before signing in.";

async function completeSignUp(page: Page, name: string, email: string) {
  await page.getByLabel("Full Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirm Password").fill(TEST_PASSWORD);
  const responsePromise = page.waitForResponse((response) => (
    response.url().includes("/api/auth/sign-up/email") && response.request().method() === "POST"
  ));
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  return responsePromise;
}

test("auth forms give accessible feedback for missing and malformed credentials", async ({ page }) => {
  let signInRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/sign-in/email")) signInRequests += 1;
  });

  await page.goto("/auth/signin");
  await page.getByRole("button", { name: "Sign in", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-describedby", "email-error");
  await expect(page.getByRole("alert").filter({ hasText: "Email is required" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Password is required" })).toBeVisible();
  expect(signInRequests).toBe(0);

  await page.goto("/auth/signup");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByLabel("Full Name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Full Name")).toBeFocused();
  await expect(page.getByRole("alert").filter({ hasText: "Full name is required" })).toBeVisible();

  await page.getByLabel("Full Name").fill("Validation Tester");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirm Password").fill(TEST_PASSWORD);
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-describedby", "email-error");
  await expect(page.getByRole("alert").filter({ hasText: "Please enter a valid email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign up", exact: true })).toBeDisabled();

  const invalidResponse = await page.request.post(new URL("/api/auth/sign-up/email", page.url()).toString(), {
    data: { name: "Validation Tester", email: "not-an-email", password: TEST_PASSWORD },
  });
  expect(invalidResponse.status()).toBe(400);
  const invalidBody = await invalidResponse.json() as { message?: string };
  expect(invalidBody.message).toBe("Please enter a valid email address");
});

test("sign-up and sign-in links preserve the callback URL", async ({ page }) => {
  const callbackUrl = "/goals/123?tab=milestones";
  const encodedCallbackUrl = encodeURIComponent(callbackUrl);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  await page.goto(`/auth/signup?callbackUrl=${encodedCallbackUrl}`);
  const response = await completeSignUp(page, "Callback Tester", `callback-${suffix}@example.com`);
  expect(response.status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText(SIGN_UP_NOTICE);

  const signInLink = page.getByRole("link", { name: "Sign in" });
  await expect(signInLink).toHaveAttribute("href", `/auth/signin?callbackUrl=${encodedCallbackUrl}`);
  await signInLink.click();
  await expect(page).toHaveURL(new URL(`/auth/signin?callbackUrl=${encodedCallbackUrl}`, page.url()).toString());

  await expect(page.getByRole("link", { name: "Sign up" })).toHaveAttribute(
    "href",
    `/auth/signup?callbackUrl=${encodedCallbackUrl}`,
  );
});

test("unverified users must verify before sign-in and can request a fresh link", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `auth-${suffix}@example.com`;

  await page.goto("/auth/signup");
  const firstResponse = await completeSignUp(page, "Original Account Name", email.toUpperCase());
  expect(firstResponse.status()).toBe(200);
  expect(firstResponse.request().postDataJSON()).toMatchObject({ email });
  expect(firstResponse.request().postDataJSON()).toHaveProperty("callbackURL", "/auth/verify-email?callbackUrl=%2Fdashboard");
  expect(firstResponse.request().postDataJSON()).not.toHaveProperty("passwordConfirm");
  const firstBody = await firstResponse.json() as { token: string | null; user: Record<string, unknown> };
  expect(firstBody.token).toBeNull();
  expect(firstBody.user.emailVerified).toBe(false);
  expect(firstBody.user.name).toBe("Original Account Name");
  expect(firstBody.user.email).toBe(email);
  await expect(page.getByRole("status")).toHaveText(SIGN_UP_NOTICE);

  await page.goto("/auth/signup");
  const duplicateResponse = await completeSignUp(page, "Unrelated Submitted Name", email.toUpperCase());
  expect(duplicateResponse.status()).toBe(firstResponse.status());
  const duplicateBody = await duplicateResponse.json() as { token: string | null; user: Record<string, unknown> };
  expect(duplicateBody.token).toBeNull();
  expect(duplicateResponse.request().postDataJSON()).not.toHaveProperty("passwordConfirm");
  expect(Object.keys(duplicateBody).sort()).toEqual(Object.keys(firstBody).sort());
  expect(Object.keys(duplicateBody.user).sort()).toEqual(Object.keys(firstBody.user).sort());
  expect(duplicateBody.user.name).toBe("Unrelated Submitted Name");
  await expect(page.getByRole("status")).toHaveText(SIGN_UP_NOTICE);

  const signIn = async (emailAddress: string, password: string, callbackUrl = "/dashboard") => {
    await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    await page.getByLabel("Email").fill(emailAddress);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const responsePromise = page.waitForResponse((response) => (
      response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST"
    ));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return responsePromise;
  };

  const unknownAccount = await signIn(`unknown-${suffix}@example.com`, "Wrong-password-2026");
  expect(unknownAccount.status()).toBe(401);
  const alertMessage = page.getByRole("alert").locator("p");
  await expect(alertMessage).toHaveText("Invalid email or password. Please try again.");
  const unknownMessage = await alertMessage.textContent();

  const wrongPassword = await signIn(email, "Wrong-password-2026");
  expect(wrongPassword.status()).toBe(401);
  await expect(page.getByRole("alert").locator("p")).toHaveText(unknownMessage ?? "");

  const callbackUrl = "/goals/123?tab=milestones";
  const unverifiedSignIn = await signIn(email, TEST_PASSWORD, callbackUrl);
  expect(unverifiedSignIn.status()).toBe(403);
  expect(unverifiedSignIn.request().postDataJSON()).toHaveProperty(
    "callbackURL",
    callbackUrl,
  );
  await expect(page.getByRole("alert").locator("p")).toContainText("verify your email address");
  const resendResponsePromise = page.waitForResponse((response) => (
    response.url().includes("/api/auth/send-verification-email") && response.request().method() === "POST"
  ));
  await page.getByRole("button", { name: "Resend verification email" }).click();
  const resendResponse = await resendResponsePromise;
  expect(resendResponse.status()).toBe(200);
  expect(resendResponse.request().postDataJSON()).toHaveProperty(
    "callbackURL",
    `/auth/verify-email?callbackUrl=${encodeURIComponent(callbackUrl)}`,
  );
  await expect(page.getByRole("status")).toContainText("a fresh link has been sent");

  markTestEmailVerified(email);
  await signIn(email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

test("invalid verification links offer a resend and preserve the requested destination", async ({ page }) => {
  const callbackUrl = "/goals/123?tab=milestones";
  await page.goto(`/auth/verify-email?callbackUrl=${encodeURIComponent(callbackUrl)}&error=invalid_token`);
  await expect(page.locator('p[role="alert"]')).toHaveText("That verification link is invalid or has expired. Request a fresh link below.");

  await page.getByRole("textbox", { name: "Email" }).fill("expired-link@example.com");
  const resendResponsePromise = page.waitForResponse((response) => (
    response.url().includes("/api/auth/send-verification-email") && response.request().method() === "POST"
  ));
  await page.getByRole("button", { name: "Send verification email" }).click();
  const resendResponse = await resendResponsePromise;
  expect(resendResponse.status()).toBe(200);
  expect(resendResponse.request().postDataJSON()).toMatchObject({
    email: "expired-link@example.com",
    callbackURL: `/auth/verify-email?callbackUrl=${encodeURIComponent(callbackUrl)}`,
  });
  await expect(page.getByRole("status")).toContainText("a fresh link has been sent");
});

test("rate limits and provider failures are shown safely while requests are pending", async ({ page }) => {
  let signInRequests = 0;
  await page.route("**/api/auth/sign-in/email", async (route) => {
    signInRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "TOO_MANY_REQUESTS", message: "internal rate-limit details" }),
    });
  });

  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  const submit = page.locator('form button[type="submit"]');
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page.getByLabel("Email")).toBeDisabled();
  const formAlert = page.locator('form > div[role="alert"]');
  await expect(formAlert).toContainText("Too many attempts. Wait a little and try again.");
  await expect(formAlert).not.toContainText("internal rate-limit details");
  expect(signInRequests).toBe(1);

  await page.route("**/api/auth/sign-in/social", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ code: "PROVIDER_ERROR", message: "private provider configuration" }),
  }));
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(formAlert).toContainText("That sign-in provider is temporarily unavailable.");
  await expect(formAlert).not.toContainText("private provider configuration");
});
