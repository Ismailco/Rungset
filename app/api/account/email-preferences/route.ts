import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getFreshSession, isSameOriginRequest } from "@/lib/admin/access";
import { sendMarketingConfirmation } from "@/lib/email/send-marketing-confirmation";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

const preferenceSchema = z.object({ marketingEmailOptIn: z.boolean() });

export async function GET(request: Request) {
  const session = await getFreshSession(request.headers);
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });

  const [account] = await db.select({
    marketingEmailOptIn: user.marketingEmailOptIn,
    marketingEmailPending: user.marketingEmailPending,
    marketingEmailUnsubscribedAt: user.marketingEmailUnsubscribedAt,
  }).from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!account) return Response.json({ error: "Account not found." }, { status: 404 });

  return Response.json({
    marketingEmailOptIn: account.marketingEmailOptIn,
    pending: account.marketingEmailPending,
    unsubscribed: account.marketingEmailUnsubscribedAt !== null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const session = await getFreshSession(request.headers);
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = preferenceSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid email preference." }, { status: 400 });

  const [account] = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    marketingEmailOptIn: user.marketingEmailOptIn,
    marketingEmailPending: user.marketingEmailPending,
    marketingEmailTokenVersion: user.marketingEmailTokenVersion,
  }).from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!account) return Response.json({ error: "Account not found." }, { status: 404 });

  if (!parsed.data.marketingEmailOptIn) {
    await db.update(user).set({
      marketingEmailOptIn: false,
      marketingEmailPending: false,
      marketingEmailUnsubscribedAt: new Date(),
      marketingEmailTokenVersion: account.marketingEmailTokenVersion + 1,
    }).where(and(eq(user.id, account.id), eq(user.marketingEmailTokenVersion, account.marketingEmailTokenVersion)));
    return Response.json({ marketingEmailOptIn: false, pending: false, unsubscribed: true });
  }

  if (account.marketingEmailOptIn) {
    return Response.json({ marketingEmailOptIn: true, pending: false, unsubscribed: false });
  }

  const tokenVersion = account.marketingEmailTokenVersion + 1;
  await db.update(user).set({
    marketingEmailOptIn: false,
    marketingEmailPending: true,
    marketingEmailTokenVersion: tokenVersion,
  }).where(and(eq(user.id, account.id), eq(user.marketingEmailTokenVersion, account.marketingEmailTokenVersion)));

  try {
    await sendMarketingConfirmation({ ...account, marketingEmailTokenVersion: tokenVersion });
  } catch {
    console.error(JSON.stringify({ event: "marketing_confirmation_send_failed" }));
    return Response.json({ error: "Could not send the confirmation email. Try again shortly." }, { status: 502 });
  }

  return Response.json({ marketingEmailOptIn: false, pending: true, unsubscribed: false });
}
