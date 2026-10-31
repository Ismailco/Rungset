import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/db';
import { todoOccurrences, todos } from '@/lib/db/schema';
import { getAuthenticatedUserId } from '@/lib/server/authenticated-user';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const todoId = request.nextUrl.searchParams.get('todoId');
    const conditions = [eq(todos.userId, userId)];
    if (todoId) conditions.push(eq(todoOccurrences.todoId, todoId));

    const occurrences = await db
      .select({
        id: todoOccurrences.id,
        todoId: todoOccurrences.todoId,
        occurrenceDate: todoOccurrences.occurrenceDate,
        completedAt: todoOccurrences.completedAt,
        createdAt: todoOccurrences.createdAt,
      })
      .from(todoOccurrences)
      .innerJoin(todos, eq(todoOccurrences.todoId, todos.id))
      .where(and(...conditions));

    return NextResponse.json(occurrences);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch task completion history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const bodyResult = await readJsonBodyWithLimit(request, 2 * 1024 * 1024);
    if (!bodyResult.ok) return bodyResult.response;

    const data = bodyResult.data as {
      todoId?: string;
      occurrenceDate?: string;
      completedAt?: string;
    };

    if (!data.todoId || !data.occurrenceDate) {
      return NextResponse.json({ error: 'todoId and occurrenceDate are required' }, { status: 400 });
    }

    const [todo] = await db
      .select({ id: todos.id })
      .from(todos)
      .where(and(eq(todos.id, data.todoId), eq(todos.userId, userId)))
      .limit(1);

    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    const [inserted] = await db
      .insert(todoOccurrences)
      .values({
        id: uuidv4(),
        todoId: data.todoId,
        occurrenceDate: data.occurrenceDate,
        completedAt: data.completedAt ? new Date(data.completedAt) : new Date(),
      })
      .onConflictDoNothing()
      .returning();

    return NextResponse.json(inserted ?? { success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to record task occurrence' }, { status: 500 });
  }
}
