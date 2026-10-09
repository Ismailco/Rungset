import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getAdminAccess, isSameOriginRequest } from "@/lib/admin/access";
import { createEmailPreferenceToken } from "@/lib/email/preference-token";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

const MAX_RECIPIENTS = 1000;
const SEND_CONCURRENCY = 8;
const emailSchema = z.object({
  subject: z.string().trim().min(1).max(120).refine((value) => !/[\r\n]/.test(value)),
  message: z.string().trim().min(1).max(10_000),
});

export async function POST(request: Request) {
  const { env, isAdmin, session } = await getAdminAccess(request.headers);
  if (!isAdmin || !session) return Response.json({ error: "Not found" }, { status: 404 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Enter a subject and message within the allowed lengths." }, { status: 400 });

  const subscribers = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    tokenVersion: user.marketingEmailTokenVersion,
  }).from(user).where(and(
    eq(user.marketingEmailOptIn, true),
    isNull(user.marketingEmailUnsubscribedAt),
  )).orderBy(asc(user.id)).limit(MAX_RECIPIENTS + 1);

  if (subscribers.length > MAX_RECIPIENTS) {
    return Response.json({ error: "This dashboard supports up to 1,000 recipients per campaign. A queued campaign sender is needed for larger lists." }, { status: 413 });
  }
  if (subscribers.length === 0) return Response.json({ error: "There are no confirmed subscribers to email." }, { status: 409 });

  let nextIndex = 0;
  let sent = 0;
  let failed = 0;
  const sendWorker = async () => {
    while (nextIndex < subscribers.length) {
      const recipient = subscribers[nextIndex++];
      try {
        const token = await createEmailPreferenceToken(
          recipient.id,
          recipient.tokenVersion,
          "unsubscribe",
          env.BETTER_AUTH_SECRET,
        );
        const unsubscribeUrl = new URL("/email-preferences", env.NEXT_PUBLIC_APP_URL);
        unsubscribeUrl.searchParams.set("token", token);
        const oneClickUrl = new URL("/api/email/unsubscribe", env.NEXT_PUBLIC_APP_URL);
        oneClickUrl.searchParams.set("token", token);
        const message = [
          `Hi ${recipient.name},`,
          "",
          parsed.data.message,
          "",
          "— The Rungset team",
          "",
          `To stop receiving product news and updates, unsubscribe here: ${unsubscribeUrl.toString()}`,
        ].join("\n");

        await env.EMAIL.send({
          from: "hello@rungset.com",
          to: recipient.email,
          subject: parsed.data.subject,
          text: message,
          headers: {
            "List-Unsubscribe": `<${oneClickUrl.toString()}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        sent += 1;
      } catch {
        failed += 1;
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(SEND_CONCURRENCY, subscribers.length) },
    () => sendWorker(),
  ));

  console.info(JSON.stringify({
    event: "admin_email_broadcast_completed",
    adminUserId: session.user.id,
    recipientCount: subscribers.length,
    sent,
    failed,
  }));

  return Response.json({ recipientCount: subscribers.length, sent, failed });
}
