import type { WorkspaceExport } from './types';
import { apiRequest } from './api';
import { createGoal } from './goals';
import { createMilestone } from './milestones';
import { createTodo } from './todos';
import { createNote } from './notes';
import { createCheckIn } from './checkins';
import { parseWorkspaceImport, type ImportSummary } from '../domain/workspace';

export { parseWorkspaceImport, type ImportSummary };

export async function getWorkspaceExport(): Promise<WorkspaceExport> {
  return apiRequest<WorkspaceExport>('export', 'GET');
}

export async function importWorkspaceData(raw: unknown): Promise<ImportSummary> {
  const data = parseWorkspaceImport(raw);

  const goalIdMap = new Map<string, string>();
  const milestoneIdMap = new Map<string, string>();

  let goalsCount = 0;
  let milestonesCount = 0;
  let tasksCount = 0;
  let notesCount = 0;
  let checkInsCount = 0;

  for (const item of data.goals) {
    if (!item.title) continue;
    try {
      const created = await createGoal({
        title: item.title,
        description: item.description ?? '',
        category: item.category ?? 'career',
        timeFrame: item.timeFrame ?? 'short-term',
        status: item.status ?? 'in-progress',
        progress: item.progress ?? 0,
        dueDate: item.dueDate,
      });
      if (item.id && created?.id) {
        goalIdMap.set(item.id, created.id);
      }
      goalsCount++;
    } catch (e) {
      console.error('Failed to import goal:', item.title, e);
    }
  }

  for (const item of data.milestones) {
    if (!item.title || !item.date) continue;
    const targetGoalId = item.goalId ? goalIdMap.get(item.goalId) ?? item.goalId : '';
    if (!targetGoalId) continue;

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
      console.error('Failed to import milestone:', item.title, e);
    }
  }

  for (const item of data.tasks) {
    if (!item.title) continue;
    const targetGoalId = item.goalId ? goalIdMap.get(item.goalId) ?? item.goalId : undefined;
    const targetMilestoneId = item.milestoneId ? milestoneIdMap.get(item.milestoneId) ?? item.milestoneId : undefined;

    try {
      await createTodo({
        title: item.title,
        description: item.description ?? '',
        priority: item.priority ?? 'medium',
        dueDate: item.dueDate,
        category: item.category,
        recurrence: item.recurrence ?? 'none',
        reminder: item.reminder ?? 'none',
        goalId: targetGoalId,
        milestoneId: targetMilestoneId,
      });
      tasksCount++;
    } catch (e) {
      console.error('Failed to import task:', item.title, e);
    }
  }

  for (const item of data.notes) {
    if (!item.title || !item.content) continue;
    try {
      await createNote({
        title: item.title,
        content: item.content,
        category: item.category,
        isPinned: Boolean(item.isPinned),
      });
      notesCount++;
    } catch (e) {
      console.error('Failed to import note:', item.title, e);
    }
  }

  for (const item of data.checkIns) {
    if (!item.date || !item.mood || !item.energy) continue;
    const targetGoalId = item.goalId ? goalIdMap.get(item.goalId) ?? item.goalId : undefined;

    try {
      await createCheckIn({
        goalId: targetGoalId,
        date: item.date,
        mood: item.mood,
        energy: item.energy,
        accomplishments: Array.isArray(item.accomplishments) ? item.accomplishments : [],
        challenges: Array.isArray(item.challenges) ? item.challenges : [],
        goals: Array.isArray(item.goals) ? item.goals : [],
        notes: item.notes,
      });
      checkInsCount++;
    } catch (e) {
      console.error('Failed to import check-in:', item.date, e);
    }
  }

  return {
    goals: goalsCount,
    milestones: milestonesCount,
    tasks: tasksCount,
    notes: notesCount,
    checkIns: checkInsCount,
  };
}
