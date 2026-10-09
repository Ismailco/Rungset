import { db } from "@/lib/db/db";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { signInCredentialsSchema, signUpCredentialsSchema } from "@/lib/auth/auth-validation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { createEmailPreferenceToken } from "@/lib/email/preference-token";
import { user as userTable } from "@/lib/db/schema";

const AUTH_BASE_PATH = "/api/auth";

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const authBaseURL =
  readEnv("BETTER_AUTH_URL") ??
  readEnv("NEXT_PUBLIC_BETTER_AUTH_URL") ??
  readEnv("NEXT_PUBLIC_APP_URL") ??
  readEnv("NEXT_PUBLIC_SITE_URL");

const authSecret = readEnv("BETTER_AUTH_SECRET");
const localTestAuthOrigins = new Set([
  "http://localhost:8787",
  "http://localhost:8788",
]);
const disableRateLimitForLocalTests =
  readEnv("BETTER_AUTH_E2E_TEST_MODE") === "true" &&
  authBaseURL !== undefined &&
  localTestAuthOrigins.has(authBaseURL);
const trustedOrigins = Array.from(
  new Set(
    [
      "http://localhost",
      "http://localhost:3000",
      "http://localhost:8787",
      "https://app.rungset.com",
      // Keep the former app origins trusted during the domain migration.
      "https://app.goalgenius.online",
      "https://www.app.goalgenius.online",
      authBaseURL ? new URL(authBaseURL).origin : undefined,
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

export const auth = betterAuth({
  basePath: AUTH_BASE_PATH,
  ...(authBaseURL ? { baseURL: authBaseURL } : {}),
  ...(authSecret ? { secret: authSecret } : {}),
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  user: {
    additionalFields: {
      marketingEmailOptIn: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: true,
      },
      marketingEmailPending: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      marketingEmailConsentAt: {
        type: "date",
        required: false,
        input: false,
      },
      marketingEmailUnsubscribedAt: {
        type: "date",
        required: false,
        input: false,
      },
      marketingEmailTokenVersion: {
        type: "number",
        required: false,
        defaultValue: 0,
        input: false,
      },
      lastLoginAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      strategy: "jwe",
      refreshCache: false,
    },
  },
  // OpenNext executes the browser-test Worker from a production build. This
  // explicit, localhost-only test switch prevents Better Auth's production
  // limiter from coupling independent browser journeys in that disposable DB.
  ...(disableRateLimitForLocalTests ? { rateLimit: { enabled: false } } : {}),
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      try {
        const { env, ctx } = getCloudflareContext();
        const safeName = escapeEmailHtml(user.name);
        const safeUrl = escapeEmailHtml(url);
        const send = env.EMAIL.send({
          from: "hello@rungset.com",
          to: user.email,
          subject: "Verify your Rungset email address",
          text: [
            `Hello ${user.name},`,
            "",
            "Welcome to Rungset. Confirm your email address to activate your account:",
            url,
            "",
            "This link expires in one hour. If you did not create a Rungset account, you can ignore this email.",
          ].join("\n"),
          html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Verify your Rungset email</title></head><body><main><h1>Verify your Rungset email</h1><p>Hello ${safeName},</p><p>Welcome to Rungset. Confirm your email address to activate your account.</p><p><a href="${safeUrl}">Verify email address</a></p><p>This link expires in one hour. If you did not create a Rungset account, you can ignore this email.</p></main></body></html>`,
        }).then(() => {
          console.info(JSON.stringify({ event: "email_verification_sent" }));
        }).catch((error: unknown) => {
          console.error(JSON.stringify({ event: "email_verification_failed", code: getEmailErrorCode(error) }));
        });
        ctx.waitUntil(send);
      } catch (error) {
        console.error(JSON.stringify({ event: "email_verification_not_scheduled", code: getEmailErrorCode(error) }));
      }
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
    expiresIn: 60 * 60,
    autoSignInAfterVerification: true,
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const optedIn = newUser.marketingEmailOptIn === true;
          return {
            data: {
              ...newUser,
              marketingEmailOptIn: false,
              marketingEmailPending: optedIn,
              marketingEmailConsentAt: null,
              marketingEmailUnsubscribedAt: null,
              marketingEmailTokenVersion: 0,
            },
          };
        },
        after: async (newUser) => {
          const tokenVersion = Number(newUser.marketingEmailTokenVersion ?? 0);
          const clearPendingOptIn = async () => {
            if (!newUser.marketingEmailPending) return;
            try {
              await db.update(userTable).set({
                marketingEmailPending: false,
                marketingEmailTokenVersion: tokenVersion + 1,
              }).where(and(
                eq(userTable.id, newUser.id),
                eq(userTable.marketingEmailPending, true),
                eq(userTable.marketingEmailTokenVersion, tokenVersion),
              ));
            } catch {
              console.error(JSON.stringify({ event: "marketing_email_pending_reset_failed" }));
            }
          };

          try {
            const { env, ctx } = getCloudflareContext();
            const confirmUrl = newUser.marketingEmailPending
              ? `${env.NEXT_PUBLIC_APP_URL}/email-preferences/confirm?token=${encodeURIComponent(await createEmailPreferenceToken(newUser.id, tokenVersion, "confirm", env.BETTER_AUTH_SECRET))}`
              : undefined;
            const message = [
              `Hi ${newUser.name},`,
              "",
              "Welcome to Rungset. Verify your email address before signing in to your account.",
              confirmUrl ? "" : undefined,
              confirmUrl ? "You asked to receive product news and updates. Confirm that choice here:" : undefined,
              confirmUrl,
              "",
              "— The Rungset team",
            ].filter((line): line is string => typeof line === "string").join("\n");
            const send = env.EMAIL.send({
              from: "hello@rungset.com",
              to: newUser.email,
              subject: "Welcome to Rungset",
              text: message,
            }).then(() => {
              console.info(JSON.stringify({ event: "welcome_email_sent" }));
            }).catch(async (error: unknown) => {
              console.error(JSON.stringify({ event: "welcome_email_failed", code: getEmailErrorCode(error) }));
              await clearPendingOptIn();
            });
            ctx.waitUntil(send);
          } catch (error) {
            console.error(JSON.stringify({ event: "welcome_email_not_scheduled", code: getEmailErrorCode(error) }));
            await clearPendingOptIn();
          }
        },
      },
    },
    session: {
      create: {
        after: async (newSession) => {
          await db.update(userTable)
            .set({ lastLoginAt: new Date() })
            .where(eq(userTable.id, newSession.userId));
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path.endsWith("/update-user") &&
        typeof ctx.body === "object" &&
        ctx.body !== null &&
        !Array.isArray(ctx.body) &&
        Object.hasOwn(ctx.body, "marketingEmailOptIn")
      ) {
        throw new APIError("BAD_REQUEST", {
          code: "FIELD_NOT_ALLOWED",
          message: "Update marketing email preferences through the account preferences settings.",
        });
      }

      const schema = ctx.path === "/sign-in/email"
        ? signInCredentialsSchema
        : ctx.path === "/sign-up/email"
          ? signUpCredentialsSchema
          : null;
      if (!schema) return;

      const result = schema.safeParse(ctx.body);
      if (!result.success) {
        throw new APIError("BAD_REQUEST", {
          code: "INVALID_AUTH_INPUT",
          message: result.error.issues[0]?.message ?? "Invalid authentication details",
        });
      }

      return { context: { body: result.data } };
    }),
  },
  socialProviders: {
    google: {
      enabled: true,
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET as string,
      requireEmailVerification: true,
      // redirectUri: process.env.AUTH_GOOGLE_REDIRECT_URI as string,
    },
    github: {
      enabled: true,
      clientId: process.env.AUTH_GITHUB_CLIENT_ID as string,
      clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET as string,
      requireEmailVerification: true,
      // redirectUri: process.env.AUTH_GITHUB_REDIRECT_URI as string,
    },
  },
});

function getEmailErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "unknown";
}

function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
