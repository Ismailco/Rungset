import { and, eq } from "drizzle-orm";
import { verifyEmailPreferenceToken } from "@/lib/email/preference-token";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const token = url.searchParams.get("token") ?? form?.get("token");
  if (typeof token !== "string") return Response.redirect(new URL("/email-preferences/confirm?status=expired", request.url), 303);

  const claims = await verifyEmailPreferenceToken(token, process.env.BETTER_AUTH_SECRET ?? "", "confirm");
  if (!claims) return Response.redirect(new URL("/email-preferences/confirm?status=expired", request.url), 303);

  const [account] = await db.select({
    marketingEmailPending: user.marketingEmailPending,
    marketingEmailTokenVersion: user.marketingEmailTokenVersion,
  }).from(user).where(eq(user.id, claims.userId)).limit(1);
  if (!account || !account.marketingEmailPending || account.marketingEmailTokenVersion !== claims.version) {
    return Response.redirect(new URL("/email-preferences/confirm?status=expired", request.url), 303);
  }

  const [updated] = await db.update(user).set({
    marketingEmailOptIn: true,
    marketingEmailPending: false,
    marketingEmailConsentAt: new Date(),
    marketingEmailUnsubscribedAt: null,
    marketingEmailTokenVersion: claims.version + 1,
  }).where(and(
    eq(user.id, claims.userId),
    eq(user.marketingEmailPending, true),
    eq(user.marketingEmailTokenVersion, claims.version),
  )).returning({ id: user.id });
  if (!updated) {
    return Response.redirect(new URL("/email-preferences/confirm?status=expired", request.url), 303);
  }

  return Response.redirect(new URL("/email-preferences/confirm?status=confirmed", request.url), 303);
}
