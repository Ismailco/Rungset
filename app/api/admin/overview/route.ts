import { and, count, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { checkIns, goals, todos, user } from "@/lib/db/schema";
import { getAdminAccess } from "@/lib/admin/access";

export async function GET(request: Request) {
  const { isAdmin } = await getAdminAccess(request.headers);
  if (!isAdmin) return Response.json({ error: "Not found" }, { status: 404 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [users, newUsers, activeUsers, goalsCount, tasks, checkInsCount, subscribers] = await Promise.all([
    db.select({ total: count() }).from(user),
    db.select({ total: count() }).from(user).where(gte(user.createdAt, thirtyDaysAgo)),
    db.select({ total: count() }).from(user).where(gte(user.lastLoginAt, thirtyDaysAgo)),
    db.select({ total: count() }).from(goals),
    db.select({ total: count() }).from(todos),
    db.select({ total: count() }).from(checkIns),
    db.select({ total: count() }).from(user).where(and(
      eq(user.marketingEmailOptIn, true),
      isNull(user.marketingEmailUnsubscribedAt),
    )),
  ]);

  return Response.json({
    users: users[0]?.total ?? 0,
    newUsers30d: newUsers[0]?.total ?? 0,
    activeUsers30d: activeUsers[0]?.total ?? 0,
    goals: goalsCount[0]?.total ?? 0,
    tasks: tasks[0]?.total ?? 0,
    checkIns: checkInsCount[0]?.total ?? 0,
    subscribers: subscribers[0]?.total ?? 0,
  }, { headers: { "Cache-Control": "no-store" } });
}
