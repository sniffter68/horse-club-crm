# Playwright E2E

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

Start the CRM dev server separately for these legacy commands. They use Edge;
live suites also require their existing backend/database setup. The operational
reset suite is run explicitly because it resets operational data.

`npm run typecheck` checks the new spec and both Playwright configurations with
strict TypeScript in addition to the application.
