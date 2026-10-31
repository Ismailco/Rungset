import type { WorkspaceExport } from './types';
import { apiRequest } from './api';
import { createGoal } from './goals';
import { createMilestone } from './milestones';
import { createTodo, createTodoOccurrence } from './todos';
import { createNote } from './notes';
import { createCheckIn } from './checkins';
import { normalizeCheckInArray, unescapeData } from './cache';
import { parseWorkspaceImport, type ImportSummary } from '../domain/workspace';

export { parseWorkspaceImport, type ImportSummary };

export async function getWorkspaceExport(): Promise<WorkspaceExport> {
  return apiRequest<WorkspaceExport>('export', 'GET');
}

export async function importWorkspaceData(raw: unknown): Promise<ImportSummary> {
  const data = parseWorkspaceImport(raw);

  const goalIdMap = new Map<string, string>();
  const milestoneIdMap = new Map<string, string>();
  const taskIdMap = new Map<string, string>();

  let goalsCount = 0;
  let milestonesCount = 0;
  let tasksCount = 0;
  let notesCount = 0;
  let checkInsCount = 0;
  let occurrencesCount = 0;
  let failuresCount = 0;

  for (const rawItem of data.goals) {
    const item = unescapeData(rawItem as unknown as Record<string, unknown>) as unknown as typeof rawItem;
    if (!item.title) continue;
    try {
      const created = await createGoal({
        title: item.title,
        description: item.description ?? '',
        category: item.category ?? 'career',
        timeFrame: item.timeFrame ?? 'short-term',
        status: item.status ?? 'in-progress',
        progress: item.progress ?? 0,
        dueDate: item.dueDate || undefined,
      });
      if (item.id && created?.id) {
        goalIdMap.set(item.id, created.id);
      }
      goalsCount++;
    } catch (e) {
      failuresCount++;
      console.error('Failed to import goal:', item.title, e);
    }
  }

  for (const rawItem of data.milestones) {
    const item = unescapeData(rawItem as unknown as Record<string, unknown>) as unknown as typeof rawItem;
    if (!item.title || !item.date) continue;
    const targetGoalId = item.goalId ? goalIdMap.get(item.goalId) ?? item.goalId : '';
    if (!targetGoalId) {
      failuresCount++;
      continue;
    }

    try {
      const created = await createMilestone({
        goalId: targetGoalId,
        title: item.title,
        description: item.description ?? '',
        date: item.date,
        completed: Boolean(item.completed),
      });
      if (item.id && created?.id) {
        milestoneIdMap.set(item.id, created.id);
      }
      milestonesCount++;
    } catch (e) {
      failuresCount++;
      console.error('Failed to import milestone:', item.title, e);
    }
  }

  for (const rawItem of data.tasks) {
    const item = unescapeData(rawItem as unknown as Record<string, unknown>) as unknown as typeof rawItem;
    if (!item.title) continue;
    const targetGoalId = item.goalId ? goalIdMap.get(item.goalId) ?? item.goalId : undefined;
    const targetMilestoneId = item.milestoneId ? milestoneIdMap.get(item.milestoneId) ?? item.milestoneId : undefined;

    try {
      const created = await createTodo({
        title: item.title,
        description: item.description ?? '',
        priority: item.priority ?? 'medium',
        dueDate: item.dueDate || undefined,
        category: item.category || undefined,
        completed: Boolean(item.completed),
        recurrence: item.recurrence ?? 'none',
        reminder: item.reminder ?? 'none',
        goalId: targetGoalId,
        milestoneId: targetMilestoneId,
      });
      if (item.id && created?.id) {
        taskIdMap.set(item.id, created.id);
      }
      tasksCount++;
    } catch (e) {
      failuresCount++;
      console.error('Failed to import task:', item.title, e);
    }
  }

  for (const item of data.taskOccurrences) {
    if (!item.todoId || !item.occurrenceDate) continue;
    const targetTodoId = taskIdMap.get(item.todoId) ?? item.todoId;

    try {
      const created = await createTodoOccurrence({
        todoId: targetTodoId,
        occurrenceDate: item.occurrenceDate,
        completedAt: item.completedAt ? String(item.completedAt) : undefined,
      });
      if (created) {
        occurrencesCount++;
      } else {
        failuresCount++;
      }
    } catch (e) {
      failuresCount++;
      console.error('Failed to import task occurrence:', item, e);
    }
  }

  for (const rawItem of data.notes) {
    const item = unescapeData(rawItem as unknown as Record<string, unknown>) as unknown as typeof rawItem;
    if (!item.title || !item.content) continue;
    try {
      await createNote({
        title: item.title,
        content: item.content,
        category: item.category || undefined,
        isPinned: Boolean(item.isPinned),
      });
      notesCount++;
    } catch (e) {
      failuresCount++;
      console.error('Failed to import note:', item.title, e);
    }
  }

  for (const rawItem of data.checkIns) {
    const item = unescapeData(rawItem as unknown as Record<string, unknown>) as unknown as typeof rawItem;
    if (!item.date || !item.mood || !item.energy) continue;
    const targetGoalId = item.goalId ? goalIdMap.get(item.goalId) ?? item.goalId : undefined;

    try {
      await createCheckIn({
        goalId: targetGoalId,
        date: item.date,
        mood: item.mood,
        energy: item.energy,
        accomplishments: normalizeCheckInArray(rawItem.accomplishments as string[] | string | undefined),
        challenges: normalizeCheckInArray(rawItem.challenges as string[] | string | undefined),
        goals: normalizeCheckInArray(rawItem.goals as string[] | string | undefined),
        notes: item.notes || undefined,
      });
      checkInsCount++;
    } catch (e) {
      failuresCount++;
      console.error('Failed to import check-in:', item.date, e);
    }
  }

  return {
    goals: goalsCount,
    milestones: milestonesCount,
    tasks: tasksCount,
    notes: notesCount,
    checkIns: checkInsCount,
    taskOccurrences: occurrencesCount,
    failures: failuresCount,
  };
}
