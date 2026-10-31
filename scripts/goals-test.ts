import assert from 'node:assert/strict';
import type { CheckIn, Goal, Milestone, Todo, TodoOccurrence } from '../app/types/index.ts';
import { getGoalProgress, getMilestoneTaskCounts, getNextMilestone, sortGoalsForOverview } from '../lib/domain/goals.ts';
import { getCheckInActivityWeeks, getLatestGoalCheckIn, groupCheckInsByDate, sortCheckInsDescending } from '../lib/domain/checkins.ts';
import { getTodoDueBucket, matchesTodoFilters, resolveTodoGoalId, sortTodosByActionability } from '../lib/domain/todos.ts';

const timestamps = {
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal',
    title: 'Goal',
    description: 'Description',
    category: 'career',
    timeFrame: 'short-term',
    status: 'in-progress',
    progress: 0,
    ...timestamps,
    ...overrides,
  };
}

const goals = [
  goal({ id: 'completed', status: 'completed', dueDate: '2026-09-02' }),
  goal({ id: 'not-started', status: 'not-started', dueDate: '2026-09-03' }),
  goal({ id: 'active-later', status: 'in-progress', dueDate: '2026-10-01' }),
  goal({ id: 'active-sooner', status: 'in-progress', dueDate: '2026-09-28' }),
];

assert.deepEqual(
  sortGoalsForOverview(goals).map((item) => item.id),
  ['active-sooner', 'active-later', 'not-started', 'completed'],
);
assert.deepEqual(goals.map((item) => item.id), ['completed', 'not-started', 'active-later', 'active-sooner']);

const milestones: Milestone[] = [
  { id: 'complete', goalId: 'active-sooner', title: 'Completed', description: '', date: '2026-09-20', completed: true },
  { id: 'later', goalId: 'active-sooner', title: 'Later milestone', description: '', date: '2026-10-02', completed: false },
  { id: 'next', goalId: 'active-sooner', title: 'Next milestone', description: '', date: '2026-09-29', completed: false },
];
assert.equal(getNextMilestone('active-sooner', milestones)?.id, 'next');
assert.equal(getNextMilestone('missing', milestones), null);
assert.equal(getNextMilestone('complete-only', [{ ...milestones[0], goalId: 'complete-only' }]), null);

assert.equal(getGoalProgress(goal({ id: 'active-sooner' }), [milestones[0], milestones[2]], []), 50);
assert.equal(getGoalProgress(goal({ id: 'complete', status: 'completed' }), [], []), 100);

const standaloneGoal = goal({ id: 'standalone-goal' });
const standaloneTasks: Todo[] = [
  { id: 't1', goalId: 'standalone-goal', milestoneId: null, title: 'T1', completed: true, priority: 'medium', recurrence: 'none', reminder: 'none', createdAt: timestamps.createdAt, updatedAt: timestamps.updatedAt },
  { id: 't2', goalId: 'standalone-goal', milestoneId: null, title: 'T2', completed: false, priority: 'medium', recurrence: 'none', reminder: 'none', createdAt: timestamps.createdAt, updatedAt: timestamps.updatedAt },
];
assert.equal(getGoalProgress(standaloneGoal, [], standaloneTasks), 50);
assert.equal(getGoalProgress(standaloneGoal, [], [standaloneTasks[0]]), 100);

const recurringGoal = goal({ id: 'recurring-goal' });
const recurringTask: Todo = {
  id: 'r1',
  goalId: 'recurring-goal',
  milestoneId: null,
  title: 'R1',
  completed: false,
  priority: 'medium',
  recurrence: 'daily',
  reminder: 'none',
  dueDate: '2026-09-27',
  createdAt: timestamps.createdAt,
  updatedAt: '2026-09-26T12:00:00.000Z',
};
// Completed today via fallback heuristic (updated today, created earlier)
assert.equal(getGoalProgress(recurringGoal, [], [recurringTask], '2026-09-26'), 100);

// Completed today via explicit occurrences
const recurringOccurrences: TodoOccurrence[] = [
  { id: 'occ-1', todoId: 'r1', occurrenceDate: '2026-09-26', completedAt: '2026-09-26T12:00:00.000Z', createdAt: '2026-09-26T12:00:00.000Z' },
];
assert.equal(getGoalProgress(recurringGoal, [], [recurringTask], { today: '2026-09-26', occurrences: recurringOccurrences }), 100);
assert.equal(getGoalProgress(recurringGoal, [], [recurringTask], { today: '2026-09-26', occurrences: [] }), 0);

// A newly scheduled future recurring task without occurrences should not be counted as completed
const futureUncompletedTask: Todo = {
  id: 'r2',
  goalId: 'recurring-goal',
  milestoneId: null,
  title: 'R2',
  completed: false,
  priority: 'medium',
  recurrence: 'daily',
  reminder: 'none',
  dueDate: '2026-09-27',
  createdAt: '2026-09-26T10:00:00.000Z',
  updatedAt: '2026-09-26T10:00:00.000Z',
};
assert.equal(getGoalProgress(recurringGoal, [], [futureUncompletedTask], '2026-09-26'), 0);
assert.equal(getGoalProgress(recurringGoal, [], [futureUncompletedTask], { today: '2026-09-26', occurrences: [] }), 0);

const todoBase: Omit<Todo, 'id' | 'title' | 'completed' | 'dueDate' | 'priority'> = {
  goalId: 'active-sooner',
  milestoneId: null,
  description: '',
  recurrence: 'none',
  reminder: 'none',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};
const todos: Todo[] = [
  { ...todoBase, id: 'undated', title: 'Undated', completed: false, priority: 'high' },
  { ...todoBase, id: 'future', title: 'Future', completed: false, priority: 'low', dueDate: '2026-10-02' },
  { ...todoBase, id: 'today', title: 'Today', completed: false, priority: 'medium', dueDate: '2026-09-26' },
  { ...todoBase, id: 'overdue', title: 'Overdue', completed: false, priority: 'low', dueDate: '2026-09-25' },
  { ...todoBase, id: 'done', title: 'Done', completed: true, priority: 'high', dueDate: '2026-09-20' },
];
assert.deepEqual(sortTodosByActionability(todos, '2026-09-26').map((todo) => todo.id), ['overdue', 'today', 'future', 'undated', 'done']);
assert.deepEqual(todos.map((todo) => todo.id), ['undated', 'future', 'today', 'overdue', 'done']);
assert.equal(getTodoDueBucket(todos.find((todo) => todo.id === 'overdue')!, '2026-09-26'), 'overdue');
assert.equal(getTodoDueBucket(todos.find((todo) => todo.id === 'today')!, '2026-09-26'), 'today');
assert.equal(getTodoDueBucket(todos.find((todo) => todo.id === 'future')!, '2026-09-26'), 'upcoming');
assert.equal(getTodoDueBucket(todos.find((todo) => todo.id === 'undated')!, '2026-09-26'), 'undated');

assert.equal(matchesTodoFilters(todos.find((todo) => todo.id === 'today')!, { status: 'open', priority: 'medium' }), true);
assert.equal(matchesTodoFilters(todos.find((todo) => todo.id === 'done')!, { status: 'open' }), false);
assert.equal(matchesTodoFilters(todos.find((todo) => todo.id === 'done')!, { status: 'completed' }), true);
assert.equal(matchesTodoFilters(todos.find((todo) => todo.id === 'today')!, { status: 'all', query: 'Today' }), true);
assert.equal(matchesTodoFilters(todos.find((todo) => todo.id === 'today')!, { status: 'all', query: 'other goal' }, { goalTitle: 'Other Goal' }), true);
assert.equal(matchesTodoFilters(todos.find((todo) => todo.id === 'today')!, { status: 'all', goalId: 'active-sooner' }, { effectiveGoalId: 'active-sooner' }), true);
assert.equal(matchesTodoFilters(todos.find((todo) => todo.id === 'today')!, { status: 'all', goalId: 'other' }, { effectiveGoalId: 'active-sooner' }), false);

const milestoneGoalIds = new Map([['milestone', 'active-sooner']]);
assert.equal(resolveTodoGoalId({ ...todos[0], goalId: null, milestoneId: 'milestone' }, milestoneGoalIds), 'active-sooner');
assert.equal(resolveTodoGoalId({ ...todos[0], goalId: 'other', milestoneId: 'milestone' }, milestoneGoalIds), 'active-sooner');
assert.equal(resolveTodoGoalId({ ...todos[0], goalId: null, milestoneId: 'missing' }, milestoneGoalIds), null);

const taskCounts = getMilestoneTaskCounts(
  [{ id: 'm1', goalId: 'active-sooner', title: 'M1', description: '', date: '2026-09-30' }],
  [
    { ...todos[0], id: 'milestone-task', milestoneId: 'm1', completed: true },
    { ...todos[0], id: 'standalone', milestoneId: null, completed: false },
  ],
);
assert.deepEqual(taskCounts.get('m1'), { completed: 1, total: 1 });

const checkIns: CheckIn[] = [
  { id: 'unrelated', goalId: 'other', date: '2026-09-30', mood: 'good', energy: 'medium', accomplishments: [], challenges: [], goals: [], createdAt: '2026-09-30T10:00:00.000Z', updatedAt: '2026-09-30T10:00:00.000Z' },
  { id: 'older', goalId: 'active-sooner', date: '2026-09-20', mood: 'good', energy: 'medium', accomplishments: [], challenges: [], goals: [], createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z' },
  { id: 'latest', goalId: 'active-sooner', date: '2026-09-24', mood: 'good', energy: 'medium', accomplishments: [], challenges: [], goals: [], createdAt: '2026-09-24T10:00:00.000Z', updatedAt: '2026-09-24T10:00:00.000Z' },
];
assert.equal(getLatestGoalCheckIn('active-sooner', checkIns)?.id, 'latest');
assert.equal(getLatestGoalCheckIn('missing', checkIns), null);
assert.deepEqual(sortCheckInsDescending(checkIns).map((checkIn) => checkIn.id), ['unrelated', 'latest', 'older']);
assert.deepEqual(checkIns.map((checkIn) => checkIn.id), ['unrelated', 'older', 'latest']);

const sameDayCheckIn = { ...checkIns[2], id: 'same-day', updatedAt: '2026-09-24T11:00:00.000Z' };
const groupedCheckIns = groupCheckInsByDate([...checkIns, sameDayCheckIn]);
assert.equal(groupedCheckIns.get('2026-09-24')?.length, 2);
assert.deepEqual(getCheckInActivityWeeks('2026-09-26', 12).map((week) => week.length), Array(12).fill(7));
assert.equal(getCheckInActivityWeeks('2026-09-26', 12)[0][0], '2026-07-05');
assert.equal(getCheckInActivityWeeks('2024-03-01', 1)[0][0], '2024-02-25');

console.log('Goals domain tests passed.');
