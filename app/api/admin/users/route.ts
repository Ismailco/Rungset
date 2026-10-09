import { count, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { getAdminAccess, isSameOriginRequest } from "@/lib/admin/access";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

const PAGE_SIZE = 25;
const verificationRequestSchema = z.object({ userId: z.string().trim().min(1).max(128) }).strict();

export async function GET(request: Request) {
  const { isAdmin } = await getAdminAccess(request.headers);
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

  return Response.json({
    users: rows,
    page,
    pageSize: PAGE_SIZE,
    total: totalRows[0]?.total ?? 0,
  }, { headers: { "Cache-Control": "no-store" } });
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
        callbackURL: new URL("/", env.NEXT_PUBLIC_APP_URL).toString(),
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
