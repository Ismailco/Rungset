import { count, desc, like, or } from "drizzle-orm";
import { getAdminAccess } from "@/lib/admin/access";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

const PAGE_SIZE = 25;

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
