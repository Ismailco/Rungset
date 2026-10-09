import type { CheckIn, Goal, Milestone, Note, Todo, TodoOccurrence } from '@/app/types';

export interface WorkspaceExport {
  format: 'goalgenius-export';
  version: 1;
  exportedAt: string;
  data: {
    profile: { name: string; email: string } | null;
    goals: Goal[];
    milestones: Milestone[];
    tasks: Todo[];
    taskOccurrences: TodoOccurrence[];
    notes: Note[];
    checkIns: CheckIn[];
  };
}
