import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Requires the Angular dev server on :4200 and the QuickFlow API on :5080.
 * If nothing listens on :4200, Playwright starts `ng serve` itself (an already running one is reused).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx ng serve --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180_000,
    env: { NG_CLI_ANALYTICS: 'false' },
  },
});
