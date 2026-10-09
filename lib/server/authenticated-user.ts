import type { NextRequest } from "next/server";
import "server-only";
import { auth } from "@/lib/auth/auth";

export async function getVerifiedSession(requestHeaders: Headers) {
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
  return session?.user.emailVerified ? session : null;
}

export async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const session = await getVerifiedSession(request.headers);
  return session?.user.id ?? null;
}
