# Backend for the iOS app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two backend changes the iPhone app needs: joining a household with only its invite code, and a monthly job that generates last month's reports on the 1st.

**Architecture:** One new route on the existing households router, sharing the current join logic; one Supabase migration that schedules the existing `POST /api/reports/generate-all` endpoint with pg_cron, the same way `20260226202340_weekly_email_reports.sql` schedules weekly emails.

**Tech Stack:** Express 4 + TypeScript (Bun), bun:test with `mock.module`, Supabase Postgres (pg_cron, pg_net, Vault).

**Spec:** [`../specs/2026-10-29-ios-app-design.md`](../specs/2026-10-29-ios-app-design.md) — "Backend changes this app needs" and "The check-up month".

## Global Constraints

- Branch from `origin/test`; PR against `test` (repo CLAUDE.md). TDD for backend.
- `bash run-tests.sh` and `npx tsc --noEmit -p .` in `packages/api` must pass. Known flake: `report-flow.test.ts` can fail every step in a full run — rerun it alone.
- Households routes are mounted at both `/api/households` and `/api/household`, behind `requireAuth` and `requireTier("pro")` (`packages/api/src/index.ts:89-90`).
- The cron endpoint authenticates with `Authorization: Bearer <CRON_SECRET>`; Vault already holds `api_base_url` and `cron_secret` in every environment (used by the weekly email cron).

## Review Focus

- **A code that matches no household** must return 400 `{"error":"Invalid invite code"}` — not 404 or 500 — so the web and app show the same message.
- **Someone already in a household** joining by code gets 400 `{"error":"Already a member of a household"}`, unchanged from the id route.
- **The 11th member** gets 400 `{"error":"Household has reached the 10-member limit"}`.
- **Codes are compared exactly** as stored (the existing route uses `!==`); do not lowercase or trim beyond what Zod already does, or two households' codes could collide.
- **Re-running the migration** (e.g. `supabase db reset`) must not create a second cron job — unschedule by name first.

---

### Task 1: Join a household with only its invite code

**Files:**
- Modify: `packages/api/src/routes/households.ts` (the `joinHandler` at ~L130 and the route list at ~L350-392)
- Test: `packages/api/src/routes/__tests__/households.test.ts`

**Interfaces:**
- Produces: `POST /api/household/join` and `POST /api/households/join`, body `{ invite_code: string }` (existing `joinHouseholdSchema`), response 200 with the same body the existing `POST /:id/join` returns.
- Internal: `async function joinHousehold(req: Request, res: Response, household: Household | null): Promise<Response>` — the existing checks (code match, already a member, 10-member limit, profile update, pending invitation accepted) moved out of `joinHandler`; `joinHandler` (by id) and the new `joinByCodeHandler` both call it.

- [ ] **Step 1: Write the failing tests** in `households.test.ts`, following the file's existing mock setup:
  - `"POST /join adds the caller to the household whose code matches"` — mock `households` lookup by `invite_code` returning `{ id: "hh-1", invite_code: "ABC123" }`; expect 200 and a `profiles` update with `{ household_id: "hh-1" }` for the caller.
  - `"POST /join returns 400 Invalid invite code when no household has that code"` — lookup returns `null`; expect 400 and body `{ error: "Invalid invite code" }`.
  - `"POST /join returns 400 when the caller is already in a household"` — expect `{ error: "Already a member of a household" }`.
  - `"POST /join returns 400 when the household has 10 members"` — expect `{ error: "Household has reached the 10-member limit" }`.
  - `"POST /join validates the body"` — `{}` → 400 from `validate(joinHouseholdSchema)`.
- [ ] **Step 2: Run them and confirm they fail** — `cd packages/api && bun test --timeout 15000 src/routes/__tests__/households.test.ts`; expected: the new tests fail with 404 (no route).
- [ ] **Step 3: Implement.** Extract `joinHousehold` from `joinHandler`; add `joinByCodeHandler` that looks the household up with `supabaseAdmin.from("households").select("*").eq("invite_code", req.body.invite_code).maybeSingle()` and calls `joinHousehold`. Register `router.post("/join", validate(joinHouseholdSchema), joinByCodeHandler)` with the other non-id routes, before the `/:id` routes.
- [ ] **Step 4: Run the full API suite and typecheck** — `bash run-tests.sh` (all files 0 fail) and `npx tsc --noEmit -p .` (no output).
- [ ] **Step 5: Commit** — `fix(households): join a household with only its invite code`.

### Task 2: Generate last month's reports on the 1st

**Files:**
- Create: `packages/api/supabase/migrations/20261029140000_monthly_report_generation.sql`

**Interfaces:**
- Consumes: `POST /api/reports/generate-all` (exists; generates every user's and household's report for the previous calendar month; `Authorization: Bearer <CRON_SECRET>`).
- Produces: a pg_cron job named `monthly-report-generation`, schedule `0 9 1 * *` (09:00 UTC on the 1st).

- [ ] **Step 1: Write the migration.** First `select cron.unschedule('monthly-report-generation') where exists (select 1 from cron.job where jobname = 'monthly-report-generation');`, then `cron.schedule('monthly-report-generation', '0 9 1 * *', $$ select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'api_base_url') || '/api/reports/generate-all', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{}'::jsonb); $$);` — same shape as the weekly email job.
- [ ] **Step 2: Verify on a local Supabase** built from all migrations: `select jobname, schedule from cron.job where jobname = 'monthly-report-generation';` returns exactly one row with `0 9 1 * *`; apply the migration a second time and the count is still 1.
- [ ] **Step 3: Confirm the endpoint's own tests still pass** — `bun test --timeout 15000 src/__tests__/integration/report-flow.test.ts` (steps 7 and 8 cover the valid and invalid cron secret).
- [ ] **Step 4: Commit** — `feat(reports): generate last month's reports on the 1st`.
- [ ] **Step 5: After deploy to test, check the job exists there** — the Deploy to Test run's `migrate` job passes; note in the PR that the first real run happens on the next 1st.

Known limit (not fixed here): `generateAllReports` runs users sequentially inside one function call (max 300 s on Vercel). At today's user count that's fine; if it ever approaches the limit, split it into per-user jobs.
