# Playwright E2E

Full CRM audit (isolated API fixtures; no backend/database required):

```sh
npm --prefix frontend run test:e2e:audit
```

Run that command from the repository root, or `npm run test:e2e:audit` from
`frontend/`. The suite is `tests/e2e/full-crm-audit.spec.ts`; its config starts
Vite and runs Edge at 1440×900 and 390×844 in both themes. It checks 15 routes,
scroll geometry, populated client pagination, five business workflows and
TRAINER restrictions. Unknown API endpoints fail rather than returning empty
successes. `npm run typecheck` includes this suite under strict TypeScript.
Screenshots and JSON results go to `docs/test-reports/`; traces on failure go
to `frontend/test-results/full-crm-audit/`. Run legacy suites sequentially:
their default output cleanup owns the parent `test-results/` directory.

`npm ci` applies the pinned UI compatibility patches through `postinstall`.
After applying them to an already running Vite server, restart it with `--force`
to rebuild optimized dependencies. This suite verifies browser/API contracts;
actual PostgreSQL persistence and production accounts require a separate live run.

Run from `frontend/`:

```sh
npm ci
npm --prefix ../landing ci
npx playwright install --with-deps chromium
npm run test:e2e
```

The default suite runs four landing scenarios on desktop Chromium (1440 × 900)
and mobile Chrome (Pixel 5). Playwright starts the CRM Vite server at
`http://localhost:5173` and the separate `landing/` Vite application at
`http://localhost:5174`. The landing spec overrides `baseURL` to use the latter.
Local servers are reused; CI requires free ports. Backend and PostgreSQL are
not required: public content and Maps are mocked, and invalid booking attempts
must never submit a lead.

The Hero assertion uses the current published copy:
«Ваш первый шаг к лошадям — без страха и суеты».
The footer must show five columns on desktop and reflow into one on mobile.

```sh
npm run test:e2e:ui
npm run test:e2e:report
npm run test:e2e -- --project=mobile-chrome
npm run test:e2e -- --retries=1
```

Reports are saved in `playwright-report/`, failure screenshots and videos in
`test-results/`. Traces are recorded on the first retry (CI retries twice;
locally pass `--retries=1` when needed).

Existing CRM suites retain their original configuration and requirements:

```sh
npm run test:e2e:mock
npm run test:e2e:live
npx playwright test --config=playwright.crm.config.ts --project=operational-reset
```

The mock project also includes `workspace.spec.ts` and `trainer-tma.spec.ts`;
the standalone workspace and TMA configurations remain available for focused runs.
For a complete CRM regression run without retries:

```powershell
$env:CRM_TEST_BASE_URL = 'http://127.0.0.1:5173'
npm.cmd run test:e2e:mock -- --workers=3 --retries=0
```

Use deterministic UUID v4 values for entity IDs, including related records and
request assertions. Invalid-ID cases intentionally retain malformed values.
TRAINER sessions redirect desktop routes to `/trainer`; desktop read-only
catalogue scenarios use MANAGER with `READ_ONLY` or STABLE_WORKER instead.
Mock horse availability as well as the catalogue: the shared lesson drawer
requires an `AVAILABLE` workload entry before a horse can be selected.

Start the CRM dev server separately for these legacy commands. They use Edge;
live suites also require their existing backend/database setup. The operational
reset suite is run explicitly because it resets operational data.

`npm run typecheck` checks the new spec and both Playwright configurations with
strict TypeScript in addition to the application.
