import type { Goal, Milestone, Todo } from '../../app/types/index.ts';
import { calculateGoalProgress, type MilestoneProgressInput } from './progress.ts';

export interface MilestoneTaskCount {
  completed: number;
  total: number;
}

const GOAL_STATUS_ORDER: Record<Goal['status'], number> = {
  'in-progress': 0,
  'not-started': 1,
  completed: 2,
};

function compareDescending(left: string, right: string): number {
  return right.localeCompare(left);
}

function compareOptionalAscending(left?: string, right?: string): number {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function getNextMilestone(goalId: string, milestones: Milestone[]): Milestone | null {
  return milestones
    .map((milestone, index) => ({ milestone, index }))
    .filter(({ milestone }) => milestone.goalId === goalId && !milestone.completed)
    .sort((left, right) => {
      const dateDifference = left.milestone.date.localeCompare(right.milestone.date);
      return dateDifference !== 0 ? dateDifference : left.index - right.index;
    })
    .map(({ milestone }) => milestone)[0] ?? null;
}

export function getGoalProgress(
  goal: Goal,
  milestones: Milestone[],
  todos: Todo[],
  today?: string,
): number {
  if (goal.status === 'completed') return 100;

  const goalMilestones = milestones.filter((milestone) => milestone.goalId === goal.id);
  const milestoneIds = new Set(goalMilestones.map((milestone) => milestone.id));
  const goalTodos = todos.filter((todo) => todo.goalId === goal.id || (todo.milestoneId ? milestoneIds.has(todo.milestoneId) : false));

  const isTaskDone = (todo: Todo) =>
    todo.completed || Boolean(today && todo.recurrence !== 'none' && todo.dueDate && todo.dueDate > today);

  const standaloneTasks = goalTodos.filter((todo) => !todo.milestoneId || !milestoneIds.has(todo.milestoneId));

  const milestoneInputs: MilestoneProgressInput[] = goalMilestones.map((milestone) => {
    const milestoneTasks = goalTodos.filter((todo) => todo.milestoneId === milestone.id);
    return {
      completed: milestone.completed,
      tasksCompleted: milestoneTasks.filter(isTaskDone).length,
      tasksTotal: milestoneTasks.length,
    };
  });

  if (standaloneTasks.length > 0) {
    milestoneInputs.push({
      completed: false,
      tasksCompleted: standaloneTasks.filter(isTaskDone).length,
      tasksTotal: standaloneTasks.length,
    });
  }

  if (milestoneInputs.length === 0) return 0;

  return calculateGoalProgress(milestoneInputs, goal.status);
}

export function getMilestoneTaskCounts(milestones: Milestone[], todos: Todo[]): Map<string, MilestoneTaskCount> {
  return new Map(milestones.map((milestone) => {
    const milestoneTodos = todos.filter((todo) => todo.milestoneId === milestone.id);
    return [milestone.id, {
      completed: milestoneTodos.filter((todo) => todo.completed).length,
      total: milestoneTodos.length,
    }];
  }));
}

export function sortGoalsForOverview(goals: Goal[]): Goal[] {
  return goals
    .map((goal, index) => ({ goal, index }))
    .sort((left, right) => {
      const statusDifference = GOAL_STATUS_ORDER[left.goal.status] - GOAL_STATUS_ORDER[right.goal.status];
      if (statusDifference !== 0) return statusDifference;

      const dueDateDifference = compareOptionalAscending(left.goal.dueDate, right.goal.dueDate);
      if (dueDateDifference !== 0) return dueDateDifference;

      const updatedDifference = compareDescending(left.goal.updatedAt, right.goal.updatedAt);
      if (updatedDifference !== 0) return updatedDifference;

      const createdDifference = compareDescending(left.goal.createdAt, right.goal.createdAt);
      if (createdDifference !== 0) return createdDifference;

      return left.index - right.index;
    })
    .map(({ goal }) => goal);
}
