// One-command E2E run on the isolated database `quickflow_e2e` (M09 F1).
//
//   npm run e2e:full                         # whole suite (e2e/*.spec.ts)
//   npm run e2e:full -- e2e/m09-journey.spec.ts   # extra args go to `playwright test`
//   npm run e2e:screenshots                  # screenshot walkthrough (e2e/*.walkthrough.ts) instead of the suite
//
// Steps:
//   1. fail if anything already listens on :5080 (API) or :4200 (ng serve). Nothing is killed: an unknown
//      process may be a dev API on the dev DB, and the run must own both ports.
//   2. reset `quickflow_e2e` (DROP + CREATE) with ../backend/scripts/reset-e2e-db.ps1 while no API runs.
//   3. `playwright test -c playwright.e2e-full.config.ts`, which starts the backend from ../backend on :5080
//      against `quickflow_e2e` (env switch only, no secrets) and `ng serve` on :4200, and stops both at the end.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const resetScript = resolve(frontendDir, '..', 'backend', 'scripts', 'reset-e2e-db.ps1');
const PORTS = [
  { port: 5080, what: 'QuickFlow API' },
  { port: 4200, what: 'Angular dev server' },
];

const args = process.argv.slice(2);
const walkthrough = args.includes('--walkthrough');
const passThrough = args.filter((a) => a !== '--walkthrough');

/** True when something accepts TCP connections on localhost:port (IPv4 or IPv6). */
function listening(port, host) {
  return new Promise((done) => {
    const socket = connect({ port, host });
    const finish = (result) => {
      socket.destroy();
      done(result);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function busyPorts() {
  const busy = [];
  for (const { port, what } of PORTS) {
    if ((await listening(port, '127.0.0.1')) || (await listening(port, '::1'))) busy.push(`${port} (${what})`);
  }
  return busy;
}

function step(message) {
  console.log(`\n[e2e:full] ${message}`);
}

step('1/3 checking that ports 5080 and 4200 are free');
const busy = await busyPorts();
if (busy.length > 0) {
  console.error(
    `[e2e:full] Port(s) in use: ${busy.join(', ')}.\n` +
      '[e2e:full] Stop that process first (this run starts its own API on the E2E database and its own ng serve).\n' +
      '[e2e:full] Nothing was reset or started.',
  );
  process.exit(1);
}

step('2/3 resetting the E2E database quickflow_e2e');
const reset = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resetScript], {
  stdio: 'inherit',
});
if (reset.status !== 0) {
  console.error(`[e2e:full] reset-e2e-db.ps1 failed (exit ${reset.status ?? reset.error}). Playwright was not started.`);
  process.exit(1);
}

step(`3/3 running Playwright (${walkthrough ? 'screenshot walkthrough' : 'full suite'}) on quickflow_e2e`);
const env = { ...process.env, NG_CLI_ANALYTICS: 'false' };
if (walkthrough) env.QF_E2E_WALKTHROUGH = '1';
const run = spawnSync(process.execPath, [playwrightCli, 'test', '-c', 'playwright.e2e-full.config.ts', ...passThrough], {
  cwd: frontendDir,
  stdio: 'inherit',
  env,
});

const left = await busyPorts();
if (left.length > 0) console.warn(`[e2e:full] Warning: still listening after the run: ${left.join(', ')}`);
process.exit(run.status ?? 1);
