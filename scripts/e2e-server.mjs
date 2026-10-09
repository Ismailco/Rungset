import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const port = 8788;
const baseUrl = `http://localhost:${port}`;
const persistDir = process.env.RUNGSET_E2E_PERSIST_DIR ?? await mkdtemp(join(tmpdir(), 'rungset-e2e-'));

const migration = spawnSync('pnpm', [
  'exec', 'wrangler', 'd1', 'migrations', 'apply', 'goalgenius_db',
  '--local', '--persist-to', persistDir, '--config', 'wrangler.jsonc',
], { cwd: root, stdio: 'inherit', env: process.env });

if (migration.status !== 0) {
  await rm(persistDir, { recursive: true, force: true });
  process.exit(migration.status ?? 1);
}

const worker = spawn('pnpm', [
  'exec', 'wrangler', 'dev', '--local', '--persist-to', persistDir,
  '--port', String(port), '--config', 'wrangler.jsonc',
  '--show-interactive-dev-session', 'false',
], {
  cwd: root,
  env: {
    ...process.env,
    BETTER_AUTH_URL: baseUrl,
    BETTER_AUTH_E2E_TEST_MODE: 'true',
    NEXT_PUBLIC_APP_URL: baseUrl,
    NODE_ENV: 'test',
  },
  stdio: 'inherit',
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  worker.kill('SIGTERM');
  await rm(persistDir, { recursive: true, force: true });
}

process.on('SIGINT', async () => { await stop(); process.exit(130); });
process.on('SIGTERM', async () => { await stop(); process.exit(143); });
worker.on('exit', async (code) => {
  await stop();
  process.exit(code ?? 1);
});
