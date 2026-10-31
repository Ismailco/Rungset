import type { WorkspaceExport } from '../storage/types.ts';

export interface ImportSummary {
  goals: number;
  milestones: number;
  tasks: number;
  notes: number;
  checkIns: number;
  taskOccurrences: number;
  failures: number;
}

export function parseWorkspaceImport(raw: unknown): WorkspaceExport['data'] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid file format. Expected a JSON object.');
  }

  const payload = raw as Record<string, unknown>;
  const source = (payload.data && typeof payload.data === 'object')
    ? (payload.data as Record<string, unknown>)
    : payload;

  return {
    profile: (source.profile as WorkspaceExport['data']['profile']) ?? null,
    goals: Array.isArray(source.goals) ? source.goals : [],
    milestones: Array.isArray(source.milestones) ? source.milestones : [],
    tasks: Array.isArray(source.tasks)
      ? source.tasks
      : Array.isArray(source.todos)
        ? source.todos
        : [],
    taskOccurrences: Array.isArray(source.taskOccurrences) ? source.taskOccurrences : [],
    notes: Array.isArray(source.notes) ? source.notes : [],
    checkIns: Array.isArray(source.checkIns) ? source.checkIns : [],
  };
}
