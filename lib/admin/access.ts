import "server-only";

import { auth } from "@/lib/auth/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getFreshSession(requestHeaders: Headers) {
  return auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
}

export async function getAdminAccess(requestHeaders: Headers) {
  const session = await getFreshSession(requestHeaders);
  const env = getCloudflareContext().env;
  const configuredEmails = (env as unknown as Record<string, unknown>).RUNGSET_ADMIN_EMAILS;
  const allowlist = typeof configuredEmails === "string"
    ? configuredEmails.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
    : [];
  const email = session?.user.email.trim().toLowerCase();

  return {
    env,
    session,
    isAdmin: Boolean(session?.user.emailVerified && email && allowlist.includes(email)),
  };
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
