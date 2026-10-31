import assert from 'node:assert/strict';
import type { CheckIn, Goal, Milestone, Todo } from '../app/types/index.ts';
import {
  CHECK_IN_STALE_DAYS,
  getDashboardGoals,
  getGoalsNeedingCheckIn,
  getNextMilestone,
  groupUpcomingTasks,
  selectNextTask,
} from '../lib/domain/dashboard.ts';

const timestamps = {
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo',
    title: 'Task',
    completed: false,
    priority: 'medium',
    recurrence: 'none',
    reminder: 'none',
    ...timestamps,
    ...overrides,
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal',
    title: 'Goal',
    description: '',
    category: 'career',
    timeFrame: 'short-term',
    status: 'in-progress',
    progress: 0,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    ...overrides,
  };
}

function checkIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: 'check-in',
    goalId: 'goal',
    date: '2026-09-25',
    mood: 'good',
    energy: 'medium',
    accomplishments: [],
    challenges: [],
    goals: [],
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    ...overrides,
  };
}

const today = '2026-09-26';

const overdue = todo({ id: 'overdue', dueDate: '2026-09-20', priority: 'low' });
const todayHigh = todo({ id: 'today-high', dueDate: today, priority: 'high' });
const future = todo({ id: 'future', dueDate: '2026-09-28', priority: 'medium' });
const undated = todo({ id: 'undated', priority: 'high' });
const completed = todo({ id: 'completed', dueDate: '2026-09-19', completed: true });

assert.equal(selectNextTask([undated, future, todayHigh, overdue, completed], today)?.id, 'today-high');
assert.equal(selectNextTask([undated, future, overdue, completed], today), null);
assert.equal(selectNextTask([undated, future, completed], today), null);
assert.equal(selectNextTask([undated, completed], today), null);
assert.equal(
  selectNextTask(
    [
      todo({ id: 'today-low', dueDate: today, priority: 'low' }),
      todayHigh,
    ],
    today,
  )?.id,
  'today-high',
);

const sourceOrder = [undated, future, todayHigh, overdue];
selectNextTask(sourceOrder, today);
assert.deepEqual(sourceOrder.map((item) => item.id), ['undated', 'future', 'today-high', 'overdue']);

const goals = [
  goal({ id: 'active', status: 'in-progress', dueDate: '2026-10-01' }),
  goal({ id: 'not-started', status: 'not-started', dueDate: '2026-09-28' }),
  goal({ id: 'completed-goal', status: 'completed', dueDate: '2026-09-27' }),
];
const goalMilestones: Milestone[] = [
  { id: 'complete-milestone', goalId: 'active', title: 'Done', description: '', date: '2026-09-20', completed: true },
  { id: 'later-milestone', goalId: 'active', title: 'Later', description: '', date: '2026-10-02', completed: false },
  { id: 'next-milestone', goalId: 'active', title: 'Next', description: '', date: '2026-09-29', completed: false },
];

assert.equal(getNextMilestone('active', goalMilestones)?.id, 'next-milestone');
assert.equal(getNextMilestone('missing', goalMilestones), null);
assert.deepEqual(
  getDashboardGoals(goals, goalMilestones, [], 3).map((item) => item.goal.id),
  ['active', 'not-started'],
);

assert.deepEqual(
  getGoalsNeedingCheckIn(
    goals,
    [
      checkIn({ id: 'recent', goalId: 'active', date: '2026-09-24' }),
      checkIn({ id: 'unrelated', goalId: 'other-goal', date: '2026-09-01' }),
    ],
    today,
  ).map((item) => item.goal.id),
  ['not-started'],
);
assert.equal(getGoalsNeedingCheckIn([goal({ id: 'no-check-in' })], [], today)[0]?.lastCheckIn, null);
assert.equal(
  getGoalsNeedingCheckIn(
    [goal({ id: 'stale' })],
    [checkIn({ goalId: 'stale', date: '2026-09-18' })],
    today,
  )[0]?.daysSinceLastCheckIn,
  CHECK_IN_STALE_DAYS + 1,
);
assert.equal(
  getGoalsNeedingCheckIn(
    [goal({ id: 'current' })],
    [checkIn({ goalId: 'current', date: '2026-09-19' })],
    today,
  ).length,
  0,
);

const upcoming = groupUpcomingTasks(
  [
    todo({ id: 'overdue-1', dueDate: '2026-09-20' }),
    todo({ id: 'today-1', dueDate: today }),
    todo({ id: 'next-1', dueDate: '2026-09-30' }),
    todo({ id: 'outside-horizon', dueDate: '2026-10-10' }),
    todo({ id: 'undated-1' }),
    completed,
  ],
  today,
  8,
);
assert.deepEqual(upcoming.map((group) => group.name), ['today']);
assert.deepEqual(upcoming.find((group) => group.name === 'today')?.tasks.map((item) => item.id), ['today-1']);
assert.equal(upcoming.flatMap((group) => group.tasks).some((item) => item.id === 'overdue-1'), false);
assert.equal(upcoming.flatMap((group) => group.tasks).some((item) => item.id === 'next-1'), false);
assert.equal(upcoming.flatMap((group) => group.tasks).some((item) => item.completed), false);

console.log('Dashboard domain tests passed.');
