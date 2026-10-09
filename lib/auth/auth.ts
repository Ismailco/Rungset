import { db } from "@/lib/db/db";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { signInCredentialsSchema, signUpCredentialsSchema } from "@/lib/auth/auth-validation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
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
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
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
          try {
            const { env, ctx } = getCloudflareContext();
            const confirmUrl = newUser.marketingEmailPending
              ? `${env.NEXT_PUBLIC_APP_URL}/email-preferences/confirm?token=${encodeURIComponent(await createEmailPreferenceToken(newUser.id, Number(newUser.marketingEmailTokenVersion ?? 0), "confirm", env.BETTER_AUTH_SECRET))}`
              : undefined;
            const message = [
              `Hi ${newUser.name},`,
              "",
              "Welcome to Rungset. Your account is ready.",
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
            }).catch((error: unknown) => {
              console.error(JSON.stringify({ event: "welcome_email_failed", code: getEmailErrorCode(error) }));
            });
            ctx.waitUntil(send);
          } catch (error) {
            console.error(JSON.stringify({ event: "welcome_email_not_scheduled", code: getEmailErrorCode(error) }));
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
      // redirectUri: process.env.AUTH_GOOGLE_REDIRECT_URI as string,
    },
    github: {
      enabled: true,
      clientId: process.env.AUTH_GITHUB_CLIENT_ID as string,
      clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET as string,
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
