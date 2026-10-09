import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const e2ePersistDir = process.env.RUNGSET_E2E_PERSIST_DIR ?? join(tmpdir(), `rungset-e2e-${process.pid}`);
process.env.RUNGSET_E2E_PERSIST_DIR = e2ePersistDir;
process.env.WRANGLER_LOG_PATH ??= join(e2ePersistDir, 'wrangler.log');

const browserExecutable = process.env.BROWSER_EXECUTABLE_PATH ?? [
  '/opt/google/chrome/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find((path) => existsSync(path));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:8788',
    browserName: 'chromium',
    launchOptions: {
      ...(browserExecutable ? { executablePath: browserExecutable } : {}),
      args: ['--no-sandbox'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://localhost:8788/auth/signin',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
