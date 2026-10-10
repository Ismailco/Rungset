import { count, desc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { getAdminAccess, isSameOriginRequest } from "@/lib/admin/access";
import { isAdminEmailAddress } from "@/lib/admin/allowlist";
import { getEmailVerificationCallbackUrl } from "@/lib/auth/callback-url";
import { db } from "@/lib/db/db";
import {
  account as authAccount,
  checkIns,
  goals,
  milestones,
  notes,
  session as authSession,
  subscriptions,
  todoOccurrences,
  todos,
  user,
  verification,
} from "@/lib/db/schema";

const PAGE_SIZE = 25;
const verificationRequestSchema = z.object({ userId: z.string().trim().min(1).max(128) }).strict();
const deleteUserRequestSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  confirmationEmail: z.string().trim().email().max(320),
}).strict();

export async function GET(request: Request) {
  const { env, isAdmin } = await getAdminAccess(request.headers);
  if (!isAdmin) return Response.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const requestedPage = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 80);
  const conditions = search
    ? or(like(user.name, `%${search}%`), like(user.email, `%${search}%`))
    : undefined;

  const [rows, totalRows] = await Promise.all([
    db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      marketingEmailOptIn: user.marketingEmailOptIn,
      marketingEmailPending: user.marketingEmailPending,
      marketingEmailUnsubscribedAt: user.marketingEmailUnsubscribedAt,
    })
      .from(user)
      .where(conditions)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(user).where(conditions),
  ]);

  const userDataCounts = new Map<string, { goals: number; tasks: number; checkIns: number }>();
  if (rows.length > 0) {
    const userIds = rows.map((row) => row.id);
    const [goalCounts, taskCounts, checkInCounts] = await Promise.all([
      db.select({ userId: goals.userId, total: count() })
        .from(goals)
        .where(inArray(goals.userId, userIds))
        .groupBy(goals.userId),
      db.select({ userId: todos.userId, total: count() })
        .from(todos)
        .where(inArray(todos.userId, userIds))
        .groupBy(todos.userId),
      db.select({ userId: checkIns.userId, total: count() })
        .from(checkIns)
        .where(inArray(checkIns.userId, userIds))
        .groupBy(checkIns.userId),
    ]);

    for (const row of rows) userDataCounts.set(row.id, { goals: 0, tasks: 0, checkIns: 0 });
    for (const row of goalCounts) userDataCounts.get(row.userId)!.goals = row.total;
    for (const row of taskCounts) userDataCounts.get(row.userId)!.tasks = row.total;
    for (const row of checkInCounts) userDataCounts.get(row.userId)!.checkIns = row.total;
  }

  return Response.json({
    users: rows.map((row) => ({
      ...row,
      ...userDataCounts.get(row.id),
      protectedAccount: isAdminEmailAddress(
        row.email,
        (env as unknown as Record<string, unknown>).RUNGSET_ADMIN_EMAILS,
      ),
    })),
    page,
    pageSize: PAGE_SIZE,
    total: totalRows[0]?.total ?? 0,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const { env, isAdmin, session: adminSession } = await getAdminAccess(request.headers);
  if (!isAdmin || !adminSession) return Response.json({ error: "Not found" }, { status: 404 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = deleteUserRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Confirm the user's email to delete this account." }, { status: 400 });

  const [target] = await db.select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, parsed.data.userId))
    .limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  if (target.id === adminSession.user.id) {
    return Response.json({ error: "You cannot delete the account you are currently using." }, { status: 409 });
  }

  const configuredEmails = (env as unknown as Record<string, unknown>).RUNGSET_ADMIN_EMAILS;
  if (isAdminEmailAddress(target.email, configuredEmails)) {
    return Response.json({ error: "Admin accounts cannot be deleted from this dashboard." }, { status: 409 });
  }
  if (parsed.data.confirmationEmail.toLowerCase() !== target.email.trim().toLowerCase()) {
    return Response.json({ error: "The confirmation email does not match this account." }, { status: 400 });
  }

  try {
    await db.batch([
      db.delete(todoOccurrences).where(inArray(
        todoOccurrences.todoId,
        db.select({ id: todos.id }).from(todos).where(eq(todos.userId, target.id)),
      )),
      db.delete(todos).where(eq(todos.userId, target.id)),
      db.delete(milestones).where(eq(milestones.userId, target.id)),
      db.delete(checkIns).where(eq(checkIns.userId, target.id)),
      db.delete(notes).where(eq(notes.userId, target.id)),
      db.delete(goals).where(eq(goals.userId, target.id)),
      db.delete(subscriptions).where(eq(subscriptions.userId, target.id)),
      db.delete(verification).where(eq(verification.identifier, target.email)),
      db.delete(authAccount).where(eq(authAccount.userId, target.id)),
      db.delete(authSession).where(eq(authSession.userId, target.id)),
      db.delete(user).where(eq(user.id, target.id)),
    ]);
  } catch {
    console.error(JSON.stringify({
      event: "admin_user_delete_failed",
      adminUserId: adminSession.user.id,
      targetUserId: target.id,
    }));
    return Response.json({ error: "Could not delete this user and their data." }, { status: 500 });
  }

  console.info(JSON.stringify({
    event: "admin_user_deleted",
    adminUserId: adminSession.user.id,
    targetUserId: target.id,
  }));
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { env, isAdmin, session } = await getAdminAccess(request.headers);
  if (!isAdmin || !session) return Response.json({ error: "Not found" }, { status: 404 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = verificationRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Select a valid user." }, { status: 400 });

  const [account] = await db.select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, parsed.data.userId))
    .limit(1);
  if (!account) return Response.json({ error: "User not found." }, { status: 404 });
  if (account.emailVerified) return Response.json({ error: "This user's email is already verified." }, { status: 409 });

  try {
    const result = await auth.api.sendVerificationEmail({
      body: {
        email: account.email,
        callbackURL: new URL(
          getEmailVerificationCallbackUrl("/dashboard"),
          env.NEXT_PUBLIC_APP_URL,
        ).toString(),
      },
    });
    if (!result.status) throw new Error("Verification email was not accepted.");
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_user_verification_request_failed", code: getErrorCode(error) }));
    return Response.json({ error: "Could not send a verification email right now. Please try again shortly." }, { status: 502 });
  }

  console.info(JSON.stringify({ event: "admin_user_verification_requested", adminUserId: session.user.id }));
  return Response.json({ sent: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "unknown";
}
