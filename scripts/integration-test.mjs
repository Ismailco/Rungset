import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const port = 8787;
const baseUrl = `http://localhost:${port}`;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: { ...process.env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function queryDatabase(command) {
  const output = run('pnpm', [
    'exec', 'wrangler', 'd1', 'execute', 'goalgenius_db', '--local', '--persist-to', persistDir,
    '--config', 'wrangler.jsonc', '--command', command, '--json',
  ]);
  return JSON.parse(output)[0]?.results ?? [];
}

function markEmailVerified(email) {
  const escapedEmail = email.replace(/'/g, "''");
  run('pnpm', [
    'exec', 'wrangler', 'd1', 'execute', 'goalgenius_db', '--local', '--persist-to', persistDir,
    '--config', 'wrangler.jsonc', '--command', `UPDATE user SET email_verified = 1 WHERE email = '${escapedEmail}'`,
  ]);
}

class Client {
  constructor() { this.cookies = new Map(); }

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('origin', baseUrl);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const value of setCookies) {
      const [cookie] = value.split(';', 1);
      const separator = cookie.indexOf('=');
      if (separator > 0) this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
    let body = null;
    try { body = await response.json(); } catch { /* empty response */ }
    return { response, body };
  }

  async expect(path, expectedStatus, options) {
    const result = await this.request(path, options);
    assert.equal(result.response.status, expectedStatus, `${options?.method ?? 'GET'} ${path}: ${JSON.stringify(result.body)}`);
    return result.body;
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/auth/signin`);
      if (response.status < 500) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timed out waiting for the local Cloudflare Worker');
}

const persistDir = await mkdtemp(join(tmpdir(), 'rungset-integration-'));
let worker;
try {
  run('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'goalgenius_db', '--local', '--persist-to', persistDir, '--config', 'wrangler.jsonc']);
  worker = spawn('pnpm', ['exec', 'wrangler', 'dev', '--local', '--persist-to', persistDir, '--port', String(port), '--config', 'wrangler.jsonc', '--var', 'RUNGSET_ADMIN_EMAILS:rungset-admin@example.com', '--show-interactive-dev-session', 'false'], {
    cwd: root,
    env: { ...process.env, BETTER_AUTH_URL: baseUrl, BETTER_AUTH_E2E_TEST_MODE: 'true', NEXT_PUBLIC_APP_URL: baseUrl, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  worker.stderr.on('data', () => undefined);
  await waitForServer();

  const anonymous = new Client();
  await anonymous.expect('/api/goals', 401);

  const userA = new Client();
  const userB = new Client();
  const password = 'Rungset-test-password-2026';
  for (const [client, email, name] of [[userA, 'rungset-a@example.com', 'User A'], [userB, 'rungset-b@example.com', 'User B']]) {
    await client.expect('/api/auth/sign-up/email', 200, { method: 'POST', body: { name, email, password } });
    markEmailVerified(email);
    await client.expect('/api/auth/sign-in/email', 200, { method: 'POST', body: { email, password } });
  }

  const defaultPreferences = await userA.expect('/api/account/email-preferences', 200);
  assert.deepEqual(defaultPreferences, { marketingEmailOptIn: false, pending: false, unsubscribed: false });
  const genericConsentUpdate = await userA.request('/api/auth/update-user', {
    method: 'POST',
    body: { marketingEmailOptIn: true },
  });
  assert.equal(genericConsentUpdate.response.status, 400, JSON.stringify(genericConsentUpdate.body));
  assert.deepEqual(await userA.expect('/api/account/email-preferences', 200), defaultPreferences);

  const concurrentOptOuts = await Promise.all([
    userA.request('/api/account/email-preferences', { method: 'PATCH', body: { marketingEmailOptIn: false } }),
    userA.request('/api/account/email-preferences', { method: 'PATCH', body: { marketingEmailOptIn: false } }),
  ]);
  for (const result of concurrentOptOuts) {
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.deepEqual(result.body, { marketingEmailOptIn: false, pending: false, unsubscribed: true });
  }
  assert.deepEqual(await userA.expect('/api/account/email-preferences', 200), {
    marketingEmailOptIn: false,
    pending: false,
    unsubscribed: true,
  });

  const goalA = await userA.expect('/api/goals', 201, { method: 'POST', body: { title: 'A goal', description: 'Private A', category: 'career', timeFrame: 'short-term', status: 'in-progress' } });
  const goalA2 = await userA.expect('/api/goals', 201, { method: 'POST', body: { title: 'A second goal', category: 'health', timeFrame: 'medium-term', status: 'in-progress' } });
  const goalB = await userB.expect('/api/goals', 201, { method: 'POST', body: { title: 'B goal', category: 'learning', timeFrame: 'long-term', status: 'in-progress' } });
  const milestoneA = await userA.expect('/api/milestones', 201, { method: 'POST', body: { goalId: goalA.id, title: 'A milestone', date: '2026-01-15' } });
  const milestoneA2 = await userA.expect('/api/milestones', 201, { method: 'POST', body: { goalId: goalA2.id, title: 'A other milestone', date: '2026-01-16' } });
  const milestoneB = await userB.expect('/api/milestones', 201, { method: 'POST', body: { goalId: goalB.id, title: 'B milestone', date: '2026-01-17' } });
  const taskA = await userA.expect('/api/todos', 201, { method: 'POST', body: { goalId: goalA.id, milestoneId: milestoneA.id, title: 'A task', priority: 'high', dueDate: '2026-01-31', recurrence: 'monthly', reminder: '1d' } });
  const taskB = await userB.expect('/api/todos', 201, { method: 'POST', body: { goalId: goalB.id, milestoneId: milestoneB.id, title: 'B task', priority: 'medium' } });
  const removableMilestone = await userA.expect('/api/milestones', 201, { method: 'POST', body: { goalId: goalA.id, title: 'Removable milestone', date: '2026-01-22' } });
  const orphanedTask = await userA.expect('/api/todos', 201, { method: 'POST', body: { goalId: goalA.id, milestoneId: removableMilestone.id, title: 'Task kept after milestone deletion', priority: 'low' } });
  const noteB = await userB.expect('/api/notes', 201, { method: 'POST', body: { title: 'B note', content: 'Private B' } });
  const checkInB = await userB.expect('/api/checkins', 201, { method: 'POST', body: { goalId: goalB.id, date: '2026-01-20', mood: 'good', energy: 'medium', accomplishments: ['B progress'], challenges: ['B blocker'], goals: ['B focus'] } });
  const checkInA = await userA.expect('/api/checkins', 201, { method: 'POST', body: { goalId: goalA.id, date: '2026-01-20', mood: 'good', energy: 'medium', accomplishments: ['A progress'], challenges: [], goals: ['A focus'] } });
  const noteA = await userA.expect('/api/notes', 201, { method: 'POST', body: { title: 'A note', content: 'Private A' } });
  const retainedCheckInA = await userA.expect('/api/checkins', 201, { method: 'POST', body: { goalId: goalA2.id, date: '2026-01-21', mood: 'great', energy: 'high', accomplishments: ['A progress'], challenges: [], goals: ['A focus'] } });
  const recurringDeleteTask = await userA.expect('/api/todos', 201, { method: 'POST', body: { title: 'Deletion test task', priority: 'low', recurrence: 'weekly' } });
  await userA.expect('/api/todos', 200, { method: 'PUT', body: { id: recurringDeleteTask.id, completed: true } });
  const deleteOccurrences = await userA.expect(`/api/todo-occurrences?todoId=${recurringDeleteTask.id}`, 200);
  assert.equal(deleteOccurrences.length, 1);

  await userA.expect(`/api/goals/${goalB.id}`, 404);
  await userA.expect(`/api/milestones/${milestoneB.id}`, 404);
  await userA.expect(`/api/todos/${taskB.id}`, 404);
  await userA.expect(`/api/notes/${noteB.id}`, 404);
  await userA.expect(`/api/checkins/${checkInB.id}`, 404);

  await userA.expect('/api/goals', 404, { method: 'PUT', body: { id: goalB.id, title: 'stolen' } });
  await userA.expect('/api/milestones', 404, { method: 'PUT', body: { id: milestoneB.id, completed: true } });
  await userA.expect('/api/todos', 404, { method: 'PUT', body: { id: taskB.id, completed: true } });
  await userA.expect('/api/notes', 404, { method: 'PUT', body: { id: noteB.id, content: 'stolen' } });
  await userA.expect('/api/checkins', 404, { method: 'PUT', body: { id: checkInB.id, notes: 'stolen' } });
  await userA.expect(`/api/goals?id=${goalB.id}`, 404, { method: 'DELETE' });
  await userA.expect(`/api/milestones?id=${milestoneB.id}`, 404, { method: 'DELETE' });
  await userA.expect(`/api/todos?id=${taskB.id}`, 404, { method: 'DELETE' });
  await userA.expect(`/api/notes?id=${noteB.id}`, 404, { method: 'DELETE' });
  await userA.expect(`/api/checkins?id=${checkInB.id}`, 404, { method: 'DELETE' });

  await userA.expect('/api/milestones', 404, { method: 'POST', body: { goalId: goalB.id, title: 'cross-owner', date: '2026-01-21' } });
  await userA.expect('/api/todos', 404, { method: 'POST', body: { goalId: goalB.id, title: 'cross-owner', priority: 'low' } });
  await userA.expect('/api/todos', 400, { method: 'POST', body: { goalId: goalA.id, milestoneId: milestoneB.id, title: 'cross-owner', priority: 'low' } });
  await userA.expect('/api/checkins', 404, { method: 'POST', body: { goalId: goalB.id, date: '2026-01-21', mood: 'okay', energy: 'low', accomplishments: [], challenges: [], goals: [] } });
  await userA.expect('/api/todos', 400, { method: 'POST', body: { goalId: goalA.id, milestoneId: milestoneA2.id, title: 'wrong relationship', priority: 'low' } });
  await userA.expect(`/api/milestones?id=${removableMilestone.id}`, 200, { method: 'DELETE' });
  const unassignedTask = await userA.expect(`/api/todos/${orphanedTask.id}`, 200);
  assert.equal(unassignedTask.milestoneId, null);

  const nextTask = await userA.expect('/api/todos', 200, { method: 'PUT', body: { id: taskA.id, completed: true } });
  assert.equal(taskA.recurrence, 'monthly');
  assert.equal(nextTask.completed, false);
  assert.equal(nextTask.dueDate, '2026-02-28');
  const occurrences = await userA.expect(`/api/todo-occurrences?todoId=${taskA.id}`, 200);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].occurrenceDate, '2026-01-31');

  const exported = await userA.expect('/api/export', 200);
  assert.equal(exported.format, 'goalgenius-export');
  assert.equal(exported.version, 1);
  assert.ok(exported.data.goals.some((goal) => goal.id === goalA.id));
  assert.ok(!exported.data.goals.some((goal) => goal.id === goalB.id));
  assert.ok(exported.data.tasks.some((task) => task.id === taskA.id));
  assert.ok(!exported.data.tasks.some((task) => task.id === taskB.id));
  assert.ok(!exported.data.notes?.some((note) => note.title === 'B note'));
  assert.ok(!exported.data.checkIns?.some((checkIn) => checkIn.id === checkInB.id));

  await userA.expect(`/api/goals/${goalA.id}`, 200);
  await userA.expect(`/api/goals/${goalA.id}`, 200, { method: 'DELETE' });
  await userA.expect(`/api/milestones/${milestoneA.id}`, 404);
  await userA.expect(`/api/todos/${taskA.id}`, 404);
  const deletedOccurrences = await userA.expect(`/api/todo-occurrences?todoId=${taskA.id}`, 200);
  assert.equal(deletedOccurrences.length, 0);
  await userA.expect(`/api/checkins/${checkInA.id}`, 404);

  const admin = new Client();
  await admin.expect('/api/auth/sign-up/email', 200, { method: 'POST', body: { name: 'Test Admin', email: 'rungset-admin@example.com', password } });
  markEmailVerified('rungset-admin@example.com');
  await admin.expect('/api/auth/sign-in/email', 200, { method: 'POST', body: { email: 'rungset-admin@example.com', password } });
  await userA.expect('/api/admin/users', 404);

  const usersBeforeDelete = await admin.expect('/api/admin/users', 200);
  const accountToDelete = usersBeforeDelete.users.find((account) => account.email === 'rungset-a@example.com');
  const adminAccount = usersBeforeDelete.users.find((account) => account.email === 'rungset-admin@example.com');
  assert.ok(accountToDelete);
  assert.ok(adminAccount);
  assert.equal(accountToDelete.goals, 1);
  assert.equal(accountToDelete.checkIns, 1);

  const escapedTargetId = accountToDelete.id.replace(/'/g, "''");
  run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'goalgenius_db', '--local', '--persist-to', persistDir, '--config', 'wrangler.jsonc', '--command', [
    `INSERT INTO subscriptions (user_id, plan) VALUES ('${escapedTargetId}', 'test')`,
    `INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ('admin-delete-verification', 'rungset-a@example.com', 'test-token', 9999999999, 1, 1)`,
  ].join(';')]);

  const overviewBeforeDelete = await admin.expect('/api/admin/overview', 200);
  await admin.expect('/api/admin/users', 400, { method: 'DELETE', body: { userId: accountToDelete.id, confirmationEmail: 'wrong@example.com' } });
  await admin.expect('/api/admin/users', 409, { method: 'DELETE', body: { userId: adminAccount.id, confirmationEmail: adminAccount.email } });
  await userA.expect(`/api/notes/${noteA.id}`, 200);
  await userA.expect(`/api/checkins/${retainedCheckInA.id}`, 200);

  await admin.expect('/api/admin/users', 200, { method: 'DELETE', body: { userId: accountToDelete.id, confirmationEmail: accountToDelete.email } });
  const overviewAfterDelete = await admin.expect('/api/admin/overview', 200);
  assert.equal(overviewAfterDelete.users, overviewBeforeDelete.users - 1);
  assert.equal(overviewAfterDelete.goals, overviewBeforeDelete.goals - accountToDelete.goals);
  assert.equal(overviewAfterDelete.openTasks + overviewAfterDelete.completedTasks, overviewBeforeDelete.openTasks + overviewBeforeDelete.completedTasks - accountToDelete.tasks);
  assert.equal(overviewAfterDelete.checkIns, overviewBeforeDelete.checkIns - accountToDelete.checkIns);
  const usersAfterDelete = await admin.expect('/api/admin/users', 200);
  assert.ok(!usersAfterDelete.users.some((account) => account.id === accountToDelete.id));
  await userA.expect('/api/goals', 401);
  const remainingData = queryDatabase(`SELECT
    (SELECT count(*) FROM user WHERE id = '${escapedTargetId}') AS users,
    (SELECT count(*) FROM session WHERE user_id = '${escapedTargetId}') AS sessions,
    (SELECT count(*) FROM account WHERE user_id = '${escapedTargetId}') AS accounts,
    (SELECT count(*) FROM verification WHERE id = 'admin-delete-verification') AS verifications,
    (SELECT count(*) FROM subscriptions WHERE user_id = '${escapedTargetId}') AS subscriptions,
    (SELECT count(*) FROM goals WHERE user_id = '${escapedTargetId}') AS goals,
    (SELECT count(*) FROM milestones WHERE user_id = '${escapedTargetId}') AS milestones,
    (SELECT count(*) FROM todos WHERE user_id = '${escapedTargetId}') AS tasks,
    (SELECT count(*) FROM todo_occurrences WHERE id = '${deleteOccurrences[0].id}') AS occurrences,
    (SELECT count(*) FROM check_ins WHERE user_id = '${escapedTargetId}') AS check_ins,
    (SELECT count(*) FROM notes WHERE user_id = '${escapedTargetId}') AS notes`);
  assert.deepEqual(remainingData[0], {
    users: 0,
    sessions: 0,
    accounts: 0,
    verifications: 0,
    subscriptions: 0,
    goals: 0,
    milestones: 0,
    tasks: 0,
    occurrences: 0,
    check_ins: 0,
    notes: 0,
  });

  console.log('Authorization, preferences, relationships, recurring completion, history, and admin deletion integration tests passed.');
} finally {
  if (worker) worker.kill('SIGTERM');
  await rm(persistDir, { recursive: true, force: true });
}
