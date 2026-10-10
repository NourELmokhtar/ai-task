import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Full E2E config (M09): used by `npm run e2e:full` (scripts/e2e-full.mjs), which first checks that
 * :5080 and :4200 are free and resets `quickflow_e2e`.
 *
 * Playwright starts and later stops BOTH servers itself (`reuseExistingServer: false`, so it fails instead
 * of silently reusing a dev-DB API on :5080):
 *  - the QuickFlow API from ../backend on :5080, pointed at the E2E database by a non-secret switch
 *    (`Database__ConnectionStringName=QuickFlowE2E`; the connection string itself stays in user-secrets).
 *    Development is needed for user-secrets and startup migrations, which create the schema in the fresh DB.
 *  - `ng serve` on :4200 (the app's apiBaseUrl is http://localhost:5080).
 *
 * `QF_E2E_WALKTHROUGH=1` (npm run e2e:screenshots) runs the screenshot walkthrough (e2e/*.walkthrough.ts)
 * instead of the spec suite.
 */
const walkthrough = process.env['QF_E2E_WALKTHROUGH'] === '1';

export default defineConfig({
  ...base,
  ...(walkthrough ? { testMatch: '**/*.walkthrough.ts', timeout: 120_000 } : {}),
  webServer: [
    {
      command: 'dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080',
      cwd: '../backend',
      url: 'http://localhost:5080/api/health',
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        Database__ConnectionStringName: 'QuickFlowE2E',
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      },
    },
    {
      command: 'npx ng serve --port 4200',
      url: 'http://localhost:4200',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { NG_CLI_ANALYTICS: 'false' },
    },
  ],
});
