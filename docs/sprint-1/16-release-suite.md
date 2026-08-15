# S1-016 isolation and release suite

`pnpm test:release` is the local release command. It runs lint, type checks, canonical schema and migration checks, unit/component/integration/isolation projects, the production build, and desktop/mobile Chromium stories.

The browser suite covers the public/health boundary, protected-route denial, vague-goal blocking, known-zero baseline, five-hour/$100 resource envelope, responsive layout, and visible action-policy warning. The invariant matrix maps API/domain/repository/RLS/migration/audit/concurrency evidence.

CI installs the Playwright-pinned headless Chromium shell and retains JUnit, screenshots/traces on failure, and reports. Release remains blocked—not waived—on the raw authenticated database matrix and migration round trip until the local Supabase runtime or a dedicated test database is available.
