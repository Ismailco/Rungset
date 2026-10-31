import assert from 'node:assert/strict';
import { parseWorkspaceImport } from '../lib/domain/workspace.ts';

// Test 1: Full export payload
const exportPayload = {
  format: 'goalgenius-export',
  version: 1,
  exportedAt: '2026-10-31T12:00:00.000Z',
  data: {
    profile: { name: 'Alice', email: 'alice@example.com' },
    goals: [{ id: 'g1', title: 'Goal 1' }],
    milestones: [{ id: 'm1', goalId: 'g1', title: 'Milestone 1', date: '2026-11-01' }],
    tasks: [{ id: 't1', title: 'Task 1', goalId: 'g1', milestoneId: 'm1', completed: true }],
    taskOccurrences: [{ id: 'occ1', todoId: 't1', occurrenceDate: '2026-10-31' }],
    notes: [{ id: 'n1', title: 'Note 1', content: 'Content' }],
    checkIns: [{ id: 'c1', date: '2026-10-31', mood: 'great', energy: 'high' }],
  },
};

const parsed1 = parseWorkspaceImport(exportPayload);
assert.equal(parsed1.goals.length, 1);
assert.equal(parsed1.goals[0].title, 'Goal 1');
assert.equal(parsed1.milestones.length, 1);
assert.equal(parsed1.tasks.length, 1);
assert.equal(parsed1.tasks[0].completed, true);
assert.equal(parsed1.taskOccurrences.length, 1);
assert.equal(parsed1.taskOccurrences[0].todoId, 't1');
assert.equal(parsed1.notes.length, 1);
assert.equal(parsed1.checkIns.length, 1);

// Test 2: Flat payload with todos alias
const flatPayload = {
  goals: [{ id: 'g2', title: 'Goal 2' }],
  todos: [{ id: 't2', title: 'Task 2' }],
};

const parsed2 = parseWorkspaceImport(flatPayload);
assert.equal(parsed2.goals.length, 1);
assert.equal(parsed2.tasks.length, 1);
assert.equal(parsed2.taskOccurrences.length, 0);
assert.equal(parsed2.milestones.length, 0);
assert.equal(parsed2.notes.length, 0);
assert.equal(parsed2.checkIns.length, 0);

// Test 3: Invalid payload throws
assert.throws(() => parseWorkspaceImport(null));
assert.throws(() => parseWorkspaceImport('string'));

console.log('Import tests passed.');
