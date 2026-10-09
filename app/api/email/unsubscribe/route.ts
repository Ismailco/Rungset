import { eq } from "drizzle-orm";
import { verifyEmailPreferenceToken } from "@/lib/email/preference-token";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const token = url.searchParams.get("token") ?? form?.get("token");
  if (typeof token !== "string") return new Response("Invalid unsubscribe link.", { status: 400 });

  const claims = await verifyEmailPreferenceToken(token, process.env.BETTER_AUTH_SECRET ?? "", "unsubscribe");
  if (!claims) return new Response("This unsubscribe link is invalid or expired.", { status: 400 });

  const [account] = await db.select({
    marketingEmailOptIn: user.marketingEmailOptIn,
    marketingEmailPending: user.marketingEmailPending,
    marketingEmailUnsubscribedAt: user.marketingEmailUnsubscribedAt,
    marketingEmailTokenVersion: user.marketingEmailTokenVersion,
  }).from(user).where(eq(user.id, claims.userId)).limit(1);
  if (!account) return new Response("This unsubscribe link is invalid or expired.", { status: 400 });

  if (account.marketingEmailOptIn || account.marketingEmailPending) {
    await db.update(user).set({
      marketingEmailOptIn: false,
      marketingEmailPending: false,
      marketingEmailUnsubscribedAt: new Date(),
      marketingEmailTokenVersion: account.marketingEmailTokenVersion + 1,
    }).where(eq(user.id, claims.userId));
  }

  const isOneClick = form?.get("List-Unsubscribe") === "One-Click";
  if (isOneClick) return new Response(null, { status: 200 });

  return Response.redirect(new URL("/email-preferences?status=unsubscribed", request.url), 303);
}
