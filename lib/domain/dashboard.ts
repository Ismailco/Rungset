import { differenceInCalendarDays } from 'date-fns';
import type { CheckIn, Goal, Milestone, Todo } from '../../app/types/index.ts';
import { getLatestGoalCheckIn } from './checkins.ts';
import { parseDateOnly } from './date-only.ts';
import { getGoalProgress, getNextMilestone, sortGoalsForOverview } from './goals.ts';
import { sortTodosByActionability } from './todos.ts';

export const CHECK_IN_STALE_DAYS = 7;
export const UPCOMING_TASK_LIMIT = 8;
export const UPCOMING_NEXT_HORIZON_DAYS = 7;

export interface DashboardGoalSummary {
  goal: Goal;
  hasMilestones: boolean;
  nextMilestone: Milestone | null;
  progress: number;
}

export interface DashboardReviewGoal {
  goal: Goal;
  lastCheckIn: CheckIn | null;
  daysSinceLastCheckIn: number | null;
}

export type UpcomingTaskGroupName = 'overdue' | 'today' | 'next';

export interface UpcomingTaskGroup {
  name: UpcomingTaskGroupName;
  tasks: Todo[];
}

function sortTodosForToday(todos: Todo[], today: string): Todo[] {
  return sortTodosByActionability(todos, today);
}

export { getGoalProgress, getNextMilestone } from './goals.ts';

export function getDashboardGoals(
  goals: Goal[],
  milestones: Milestone[],
  todos: Todo[],
  limit = 3,
  today?: string,
): DashboardGoalSummary[] {
  return sortGoalsForOverview(goals.filter((goal) => goal.status !== 'completed'))
    .slice(0, limit)
    .map((goal) => ({
      goal,
      hasMilestones: milestones.some((milestone) => milestone.goalId === goal.id),
      nextMilestone: getNextMilestone(goal.id, milestones),
      progress: getGoalProgress(goal, milestones, todos, today),
    }));
}

export function selectNextTask(todos: Todo[], today: string): Todo | null {
  return sortTodosForToday(
    todos.filter((todo) => !todo.completed && todo.dueDate === today),
    today,
  )[0] ?? null;
}

export function getGoalsNeedingCheckIn(
  goals: Goal[],
  checkIns: CheckIn[],
  today: string,
): DashboardReviewGoal[] {
  return sortGoalsForOverview(goals)
    .filter((goal) => goal.status !== 'completed')
    .map((goal) => {
      const lastCheckIn = getLatestGoalCheckIn(goal.id, checkIns);
      const daysSinceLastCheckIn = lastCheckIn
        ? differenceInCalendarDays(parseDateOnly(today), parseDateOnly(lastCheckIn.date))
        : null;

      return { goal, lastCheckIn, daysSinceLastCheckIn };
    })
    .filter(({ daysSinceLastCheckIn }) =>
      daysSinceLastCheckIn === null || daysSinceLastCheckIn > CHECK_IN_STALE_DAYS,
    );
}

function sortUpcomingTasks(tasks: Todo[], today: string): Todo[] {
  return sortTodosByActionability(tasks, today);
}

export function groupUpcomingTasks(
  todos: Todo[],
  today: string,
  maxTotal = UPCOMING_TASK_LIMIT,
): UpcomingTaskGroup[] {
  const todayTasks = sortUpcomingTasks(
    todos.filter((todo) => !todo.completed && todo.dueDate === today),
    today,
  ).slice(0, maxTotal);

  if (todayTasks.length === 0) return [];

  return [{ name: 'today', tasks: todayTasks }];
}
