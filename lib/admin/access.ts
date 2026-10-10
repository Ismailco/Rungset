import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getVerifiedSession } from "@/lib/server/authenticated-user";
import { isAdminEmailAddress } from "@/lib/admin/allowlist";

export async function getAdminAccess(requestHeaders: Headers) {
  const session = await getVerifiedSession(requestHeaders);
  const env = getCloudflareContext().env;
  const configuredEmails = (env as unknown as Record<string, unknown>).RUNGSET_ADMIN_EMAILS;

  return {
    env,
    session,
    isAdmin: Boolean(session?.user.emailVerified && isAdminEmailAddress(session.user.email, configuredEmails)),
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
