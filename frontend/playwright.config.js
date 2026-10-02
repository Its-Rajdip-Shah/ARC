import {
  defineConfig,
} from '@playwright/test'

import path from 'node:path'
import {
  fileURLToPath,
} from 'node:url'


const frontendDir =
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  )

const repoRoot =
  path.resolve(
    frontendDir,
    '..',
  )


export default defineConfig({
  testDir:
    './e2e',

  fullyParallel:
    false,

  workers:
    1,

  timeout:
    30_000,

  expect: {
    timeout:
      5_000,
  },

  use: {
    baseURL:
      'http://127.0.0.1:4173',

    headless:
      true,

    trace:
      'retain-on-failure',

    screenshot:
      'only-on-failure',
  },

  webServer: [
    {
      command:
        'bash frontend/e2e/run-focus-backend.sh',

      cwd:
        repoRoot,

      url:
        'http://127.0.0.1:8001/api/health/',

      reuseExistingServer:
        false,

      timeout:
        120_000,
    },

    {
      command:
        'npm run dev -- --host 127.0.0.1 --port 4173',

      cwd:
        frontendDir,

      env: {
        VITE_API_BASE_URL:
          'http://127.0.0.1:8001/api',
      },

      url:
        'http://127.0.0.1:4173',

      reuseExistingServer:
        false,

      timeout:
        120_000,
    },
  ],
})
