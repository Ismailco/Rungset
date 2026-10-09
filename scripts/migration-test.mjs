import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = process.cwd();
const tempRoot = await mkdtemp(join(tmpdir(), 'rungset-migrations-'));
const migrationsDir = join(tempRoot, 'drizzle');
const persistDir = join(tempRoot, 'persist');
const configPath = join(tempRoot, 'wrangler.jsonc');

function run(args) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function migrationConfig() {
  return JSON.stringify({
    name: 'rungset-migration-test',
    d1_databases: [{
      binding: 'DB',
      database_name: 'goalgenius_db',
      database_id: 'e235d926-15cb-4c3d-b275-3369774cf609',
      migrations_dir: migrationsDir,
    }],
  });
}

function query(command) {
  const output = run([
    'd1', 'execute', 'goalgenius_db', '--local', '--persist-to', persistDir,
    '--config', configPath, '--command', command, '--json',
  ]);
  const parsed = JSON.parse(output);
  return parsed[0]?.results ?? [];
}

try {
  await mkdir(migrationsDir, { recursive: true });
  await writeFile(configPath, migrationConfig());

  const migrationFiles = (await readdir(join(root, 'drizzle')))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles.filter((file) => file < '0007')) {
    await cp(join(root, 'drizzle', file), join(migrationsDir, file));
  }

  run(['d1', 'migrations', 'apply', 'goalgenius_db', '--local', '--persist-to', persistDir, '--config', configPath]);
  run(['d1', 'execute', 'goalgenius_db', '--local', '--persist-to', persistDir, '--config', configPath, '--command', [
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('legacy-user', 'Legacy User', 'legacy@example.com', 1, 1, 1)",
    "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('legacy-session', 9999999999, 'legacy-session-token', 100, 100, 'legacy-user')",
    "INSERT INTO goals (id, user_id, title, description, category, time_frame, status, progress, created_at, updated_at) VALUES ('legacy-goal', 'legacy-user', 'Legacy goal', 'Before execution links', 'career', 'short-term', 'in-progress', 0, 1, 1)",
    "INSERT INTO milestones (id, goal_id, user_id, title, description, date, created_at, updated_at) VALUES ('legacy-milestone', 'legacy-goal', 'legacy-user', 'Legacy milestone', NULL, '2026-01-15', 1, 1)",
    "INSERT INTO todos (id, user_id, title, priority, completed, created_at, updated_at) VALUES ('legacy-task', 'legacy-user', 'Legacy task', 'medium', 0, 1, 1)",
    "INSERT INTO notes (id, user_id, title, content, created_at, updated_at) VALUES ('legacy-note', 'legacy-user', 'Legacy note', 'Kept during upgrade', 1, 1)",
    "INSERT INTO check_ins (id, user_id, date, mood, energy, accomplishments, challenges, goals, created_at, updated_at) VALUES ('legacy-checkin', 'legacy-user', '2026-01-20', 'good', 'medium', '[]', '[]', '[]', 1, 1)",
  ].join(';')]);

  for (const file of migrationFiles.filter((file) => file >= '0007')) {
    await cp(join(root, 'drizzle', file), join(migrationsDir, file));
  }
  run(['d1', 'migrations', 'apply', 'goalgenius_db', '--local', '--persist-to', persistDir, '--config', configPath]);

  const rows = query(`SELECT
    (SELECT count(*) FROM goals WHERE id = 'legacy-goal') AS goals,
    (SELECT count(*) FROM milestones WHERE id = 'legacy-milestone' AND completed = 0) AS milestones,
    (SELECT count(*) FROM todos WHERE id = 'legacy-task' AND goal_id IS NULL AND recurrence = 'none' AND reminder = 'none') AS tasks,
    (SELECT count(*) FROM notes WHERE id = 'legacy-note') AS notes,
    (SELECT count(*) FROM check_ins WHERE id = 'legacy-checkin' AND goal_id IS NULL) AS checkins,
    (SELECT last_login_at FROM user WHERE id = 'legacy-user') AS last_login_at,
    (SELECT marketing_email_opt_in FROM user WHERE id = 'legacy-user') AS marketing_opt_in,
    (SELECT marketing_email_pending FROM user WHERE id = 'legacy-user') AS marketing_pending,
    (SELECT marketing_email_consent_at FROM user WHERE id = 'legacy-user') AS marketing_consent_at,
    (SELECT marketing_email_unsubscribed_at FROM user WHERE id = 'legacy-user') AS marketing_unsubscribed_at,
    (SELECT marketing_email_token_version FROM user WHERE id = 'legacy-user') AS marketing_token_version`);
  assert.deepEqual(rows[0], {
    goals: 1,
    milestones: 1,
    tasks: 1,
    notes: 1,
    checkins: 1,
    last_login_at: 100,
    marketing_opt_in: 0,
    marketing_pending: 0,
    marketing_consent_at: null,
    marketing_unsubscribed_at: null,
    marketing_token_version: 0,
  });
  console.log('Fresh and pre-0007 upgrade migrations passed.');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
