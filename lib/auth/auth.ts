import { db } from "@/lib/db/db";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { signInCredentialsSchema, signUpCredentialsSchema } from "@/lib/auth/auth-validation";

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
