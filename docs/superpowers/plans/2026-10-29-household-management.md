# Household Management and Invite Codes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A household head can manage the household and rotate its invite code, and invitations work end to end — on the API, the web and the iPhone app, with the same actions and words.

**Architecture:** API first (Tasks 1–7, each TDD in `packages/api`), then the web on the new endpoints (Tasks 8–10), then the iPhone Home tab's household screens (Tasks 11–13), which run after the app foundation plan has landed because they build on its `SpendozaAPI`, `Theme` and `MainTabs`. One shared helper deletes a household for both "last member leaves" and "Delete household".

**Tech Stack:** Express 4 + Zod (`packages/shared`), bun:test with the existing `mock.module` Supabase mocks, Resend; React + TanStack Query + shadcn/ui; Swift 6 / SwiftUI / Swift Testing.

**Spec:** [`../specs/2026-10-29-household-management-design.md`](../specs/2026-10-29-household-management-design.md). The app parts also follow [`../specs/2026-10-29-ios-app-design.md`](../specs/2026-10-29-ios-app-design.md) (Home tab, theme).

> **As built (Tasks 1–10).** The interface lines below were updated after the API + web work to match what shipped; the step checklists are left as originally planned. Where a step contradicts an interface line, the interface line (and the spec) wins. Rulings R-H1–R-H18 are in the build ledger.

## Global Constraints

- Feature parity: every user-facing action in this plan exists on web **and** iPhone with the same label; API error strings are shown verbatim on both.
- Labels (exact): "Get a new code", "Copy", "Share", "Invite by email", "Pending invitations", "Revoke", "Accept", "Decline", "Rename household", "Delete household", "Remove from household", "Make head of household", "Leave household".
- Invite code: 10 chars, Crockford base-32 alphabet `0123456789abcdefghjkmnpqrstvwxyz`, stored lowercase, displayed uppercase as `ABCDE-FGHJK`. Old 8-hex codes stay valid until rotated. Join normalizes input: remove spaces and hyphens, lowercase.
- Only the head receives `invite_code` from the API (it lives in the head-only `household_invite_codes` table; absent when the household has no code row, so `Household.invite_code` is optional).
- Invitations last 7 days (`household_invitations.expires_at`); emails stored lowercased; the email never contains the household's join code but does contain the invitation's own code; links `https://www.spendoza.io/household?invitation=<code>` and the sign-up link.
- Plan rule (owner, refined by R-H14/R-H15/R-H18): create, invite, get a new code and rename need the caller on Pro; own sharing, join by code, accept, household dashboard and household reports are allowed when the caller is Pro OR the target household's head is Pro (target named per route); viewing the household and the head's pending invitations, leave, delete, transfer, remove member, revoke, decline and listing your own invitations work on any plan. Plan refusals show "Not available on your plan yet" + "Plans & billing" (`https://www.spendoza.io/pricing`). With plan checks off (no STRIPE_SECRET_KEY) everything stays open. Member limit 10 (members + live pending invitations for invites, members for joins).
- Invitation codes (owner + R-H9): 10-char Crockford code per invitation in `household_invitations.code` (unique), tied to the invited email; accept and decline require it; sign-up accepts it in the invite-code field ("Invite code or invitation code") when the sign-up email matches; every sign-up failure returns "Invalid or already-used invite code".
- Limits (R-H10): invite 20/hour per head; 10-minute resend cooldown per pending invitation (429 "You just sent this invitation. Try again in a few minutes."; claimed atomically before sending, handed back if the send fails); accept + decline 5 failed/15 min per user (shared); join by code 5 failed/15 min per user (shared by `/join` and `/:id/join`).
- Branch from `origin/test`, PR against `test`. API: `bash run-tests.sh` and `npx tsc --noEmit -p .` in `packages/api`. Web: `bun run lint`, `bun run typecheck`, `bun run test` in `packages/web`. App: `apps/ios/scripts/test.sh`.

## Review Focus

- **A removed member tries the code they knew** → 400 "Invalid invite code" (the code rotated on removal) — test in Task 3.
- **A non-head member's GET of the household** has no `invite_code` key at all (not `null`, absent) — test in Task 2.
- **Accepting with a wrong code, or a revoked, declined or other-email invitation** → 404 "Invitation not found" (all look the same, so invitations can't be probed); the caller's own expired invitation with the right code → 400 "This invitation has expired" — tests in Task 5.
- **Deleting a household** removes its household-owned reports, goals, debts, email jobs and email log rows, and never touches any member's personal (`entity_type = 'user'`) rows — test in Task 4.
- **Signing up with an invitation code but a different email, or a revoked/expired invitation** → the same "Invalid or already-used invite code" as a bad sign-up code, no account created — test in Task 6.
- **A free-plan member of a Pro head's household** can view it, leave and edit own sharing, but cannot invite, rotate or rename (plan message) or delete/remove/transfer (head-only) — tests in Task 7. **A head who drops to free** still sees the household and can transfer, remove, revoke and delete.
- **The invitation email fails to send** → the invitation is kept pending, the API answers 502 "Couldn't send the invitation email. Try again.", and an immediate retry sends it (no cooldown) — test in Task 5.

---

### Task 1: New invite-code format and forgiving join

**Files:**
- Modify: `packages/api/src/services/household.service.ts` (`generateInviteCode` stays for sign-up codes; add the household functions), `packages/api/src/routes/households.ts` (create + join use them), `packages/shared/src/household-code.ts` (new), `packages/shared/src/index.ts` (export)
- Test: `packages/api/src/services/__tests__/household-code.test.ts` (new), `packages/api/src/routes/__tests__/households.test.ts`

**Interfaces:**
- Produces (shared): `normalizeInviteCode(input: string): string` (strip whitespace and `-`, lowercase), `formatInviteCode(code: string): string` (10-char codes → `ABCDE-FGHJK`; anything else → uppercase as-is).
- Produces (api): `generateHouseholdCode(): string` (10 chars from the alphabet via `crypto.randomInt`).

- [ ] **Step 1: Failing tests.** `generateHouseholdCode()` returns 10 chars all in the alphabet; 1,000 calls give 1,000 distinct values; `normalizeInviteCode(" abcde-FGHJK ") === "abcdefghjk"`; `normalizeInviteCode("ab12cd34") === "ab12cd34"`; `formatInviteCode("abcdefghjk") === "ABCDE-FGHJK"`; `formatInviteCode("ab12cd34") === "AB12CD34"`. Route: `POST /join` with `{ invite_code: "ABC12-345XY" }` looks up `invite_code` `"abc12345xy"` (assert the `select.eq` call); `POST /` inserts a household whose `invite_code` has length 10.
- [ ] **Step 2:** `bun test --timeout 15000 src/services/__tests__/household-code.test.ts src/routes/__tests__/households.test.ts` → the new tests fail.
- [ ] **Step 3:** Implement. Join compares `household.invite_code !== normalizeInviteCode(req.body.invite_code)` too, so the by-id route accepts formatted input.
- [ ] **Step 4:** Same command → pass; full suite + tsc clean.
- [ ] **Step 5:** Commit `feat(households): longer invite codes, accept them however they're typed`.

### Task 2: Only the head sees the code; "Get a new code"

**Files:**
- Modify: `packages/api/src/routes/households.ts`
- Test: `packages/api/src/routes/__tests__/households.test.ts`

**Interfaces:**
- Produces: migration creating `household_invite_codes (household_id uuid primary key references households on delete cascade, code text unique not null, updated_at timestamptz)` — RLS select for that household's head only, no client insert/update/delete (R-H4, R-H6); existing codes copied, then `households.invite_code` dropped. `POST /api/household/invite-code` (and `/:id/invite-code`), head only, no body → 200 `{ invite_code: string }`; 403 "Only the head of household can change the invite code"; 500 "Failed to generate a new code". `GET /api/household` adds `invite_code` to `household` for the head only (absent for everyone else, and absent when there's no code row). Create inserts the code row (service role); join looks the code up there. Internal: `async function rotateInviteCode(householdId: string): Promise<string>` — upserts `{ household_id, code: generateHouseholdCode(), updated_at }` on `household_id` with the service role, checks exactly one row came back, retries up to 3 times on Postgres `23505` (unique violation), then throws. Transfer of ownership updates `head_of_household_id` with the service role after the head/membership checks (the RLS client was rejected by the policy — R-H7) and doesn't rotate.

- [ ] **Step 1: Failing tests:** head GET includes `invite_code`; non-head GET → `"invite_code" in body.household === false`; head POST `/invite-code` → 200, new 10-char code, `households` update called with it; non-head → 403 with the exact message; first update returns `{ error: { code: "23505" } }` then succeeds → 200 (two update calls).
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; suite + tsc.
- [ ] **Step 5:** Commit `feat(households): only the head sees the invite code, and can get a new one`.

### Task 3: Remove-member fix, rotate on removal, no second household

**Files:**
- Modify: `packages/api/src/routes/households.ts` (`removeMemberHandler`, create handler)
- Test: `packages/api/src/routes/__tests__/households.test.ts`

**Interfaces:**
- Consumes: `rotateInviteCode` (Task 2).

- [ ] **Step 1: Failing tests:** removing a user whose `household_id` is a different household → 404 "Member not found in this household" and no `profiles` update; removing a real member → 204 and a `households` update with a new code (rotation); after removal, `POST /join` with the old code → 400 "Invalid invite code" (mock the lookup returning null for the old code); `POST /` when the caller's profile has a `household_id` → 400 "Leave your household before creating a new one".
- [ ] **Step 2:** Run → fail. **Step 3:** Implement (look the target up with `.eq("id", userId).eq("household_id", householdId).maybeSingle()`). **Step 4:** Run → pass; suite + tsc.
- [ ] **Step 5:** Commit `fix(households): remove only real members, rotate the code when someone is removed`.

### Task 4: Rename and delete a household

**Files:**
- Modify: `packages/api/src/routes/households.ts`, `packages/api/src/services/household.service.ts`, `packages/shared/src/schemas/household.ts` (`renameHouseholdSchema`, `deleteHouseholdSchema`)
- Test: `packages/api/src/routes/__tests__/households.test.ts`, `packages/api/src/services/__tests__/household-delete.test.ts` (new)

**Interfaces:**
- Produces: `PATCH /api/household` `{ name: string 1..100 }` → 200 household row (head only; 403 "Only the head of household can rename the household"). `DELETE /api/household` `{ confirm_name: string }` → 204 (head only; 403 "Only the head of household can delete the household"; 400 "Type the household name to confirm" when it doesn't match exactly). `deleteHousehold(householdId: string): Promise<void>` in `household.service.ts` — in this order (R-H8): deletes the `household_invite_codes` row (no joins mid-delete), deletes `household_invitations`, deletes `reports`, `goals`, `debts`, `email_jobs`, `email_report_log` rows where `entity_type = 'household' and entity_id = householdId`, then the household; no explicit profiles update (`profiles.household_id` is `ON DELETE SET NULL`, so the final delete detaches everyone atomically; any earlier failure leaves the household intact and retryable). `leaveHandler`'s sole-member path calls it too. Delete household is allowed on any plan (R-H14); rename needs the caller on Pro.

- [ ] **Step 1: Failing tests:** rename head → 200 with the new name; rename non-head → 403; rename `""` → 400 (Zod). Delete: wrong name → 400 exact message, nothing deleted; head + right name → 204; `deleteHousehold` issues deletes on each listed table **with `entity_type` = `household`** (assert the eq args) and never a delete with `entity_type` = `user`; sole member leaving calls the same deletes.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; suite + tsc.
- [ ] **Step 5:** Commit `feat(households): rename and delete a household`.

### Task 5: Invitations that arrive, list, revoke, accept, decline

**Files:**
- Modify: `packages/api/src/routes/households.ts` (`inviteHandler` + new routes), `packages/api/src/services/email.service.ts` (`sendHouseholdInvitationEmail`)
- Create: `packages/api/src/emails/household-invitation.ts` (subject + HTML + text)
- Test: `packages/api/src/routes/__tests__/households.test.ts`, `packages/api/src/services/__tests__/email.service.test.ts` (extend or create)

**Interfaces:**
- Produces:
  - Migration: `household_invitations.code text` (unique index) and `last_sent_at timestamptz`; emails lowercased (backfill); clients lose direct access to the table (invitee policies dropped; column-limited select without `code`). Existing pending rows keep `code = null` and `last_sent_at = null` (no SQL-generated codes): such a legacy invitation can't be accepted until the head invites that email again, which gives it a code and sends a fresh email (the cooldown doesn't apply to a never-sent row). (The per-invitation code moved here from Task 6 — R-H9.)
  - `sendHouseholdInvitationEmail(to: string, inviterName: string, householdName: string, invitationCode: string): Promise<void>` — fixed subject "You've been invited to a household on Spendoza" (R-H11); names only in the body, as quoted values, newlines stripped, truncated to 60 chars, HTML-escaped (plain text likewise); body shows "Your invitation code: ABCDE-FGHJK", "Accept invitation" → `https://www.spendoza.io/household?invitation=<code>`, and "New to Spendoza? Create your account with invitation code ABCDE-FGHJK" → `https://www.spendoza.io/signup?invitation=<code>&email=<url-encoded email>`; never the household's join code.
  - `POST /api/household/invite` `{ email }` (head; caller on Pro; 20/hour per head → 429 "Too many invitations. Try again later."): email lowercased; an existing pending invitation for that email (live or expired) → refresh `expires_at = now() + 7 days`, keep its code (or give a legacy row one), and resend (200 `{ message: "Invitation sent" }`); otherwise insert with a new code and send (201). A live invitation sent less than 10 minutes ago → 429 "You just sent this invitation. Try again in a few minutes.". The cooldown is claimed before sending: a new row is inserted with `last_sent_at = now`; a resend sets it with a conditional update (`last_sent_at is null or < now − 10 min`) and sends only if the row came back (else the same 429), so concurrent resends send once. If the send fails, the previous `last_sent_at` (null for a new row) is restored, so an immediate retry works. Email failure → 502 `{ error: "Couldn't send the invitation email. Try again." }` with the row kept. Member limit counts members + live pending invitations, excluding the one being resent.
  - `GET /api/household/invitations` (head; any plan — R-H18) → `[{ id, email, created_at, expires_at }]` pending and unexpired; never the code.
  - `DELETE /api/household/invitations/:id` (head; any plan; must belong to this household) → 204; else 404 "Invitation not found".
  - `GET /api/household/invitations/mine` (any signed-in user, any plan) → `[{ id, household_name, inviter_name, expires_at }]` pending, unexpired, for the caller's lowercased email; no code.
  - `POST /api/household/invitations/:id/accept` `{ code }` → 200 `{ message: "Joined household successfully" }`; 404 "Invitation not found" (missing, revoked, declined, another email, wrong or missing code, or a legacy row without a code — code compared after `normalizeInviteCode`); 400 "This invitation has expired" (own invitation, right code); plus the join checks ("Already a member of a household", 10-member limit) and 500 "Couldn't join the household. Try again." when the join write fails (invitation stays pending). Marks it `accepted`.
  - `POST /api/household/invitations/:id/decline` `{ code }` → 204, marks it `declined` (404 as above; any plan).
  - Accept and decline share a limiter: 5 failed attempts per user per 15 minutes → 429 "Too many attempts. Try again in 15 minutes.".
  - These `/invitations…` routes are registered before the `/:id` routes and don't use `resolveHousehold` except the head ones.

- [ ] **Step 1: Failing tests** for every bullet above, including: the email body contains neither the current nor any 8/10-char code (assert `not.toContain(INVITE_CODE)`); resend path updates rather than inserts; Resend mock throwing → 502 and no delete of the row; accept with expired `expires_at` → 400 exact text; accept for another email → 404.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. Check `invitation_status` enum values in the initial migration; add a migration only if `declined`/`revoked` are missing (revoke deletes the row, so only `declined` may be needed). **Step 4:** Run → pass; suite + tsc.
- [ ] **Step 5:** Commit `feat(households): invitation emails, pending list, revoke, accept and decline`.

### Task 6: Invitation codes and signing up from an invitation

**Files:**
- Create: `packages/api/supabase/migrations/<timestamp>_household_invitation_codes.sql` (add `code text unique`, backfill pending rows with fresh codes generated in SQL or leave null and treat null as "no code", index)
- Modify: `packages/api/src/routes/households.ts` (`inviteHandler` generates/keeps the code; resend keeps the same code and refreshes `expires_at`), `packages/api/src/routes/auth.ts` (signup), `packages/api/src/services/email.service.ts` + `packages/api/src/emails/household-invitation.ts` (include the code + signup link), `packages/shared/src/schemas/auth.ts` (no shape change; doc comment)
- Test: `packages/api/src/routes/__tests__/auth.test.ts` (or the existing signup test file), `households.test.ts`, email tests

**Interfaces:**
- Consumes: `generateHouseholdCode`, `normalizeInviteCode` (Task 1); invitations (Task 5).
- Produces: `POST /api/auth/signup` `{ email, password, display_name, invite_code }` — `invite_code` normalized; tries `invite_codes` first (unchanged behaviour); otherwise looks for a `household_invitations` row with that `code`, `status = 'pending'`, `expires_at > now()`, `email = lower(signup email)`; on match creates the user (same admin.createUser path), then: if plan checks are on and the household's head isn't on Pro → `household_not_on_plan: true` (R-H13); else joins via `addToHousehold` — full household → `household_full: true`; a failed join write → `joined_household: false` with no flag; in all three cases the account exists and the invitation stays pending. On a join, marks the invitation `accepted` and answers `joined_household: true`. Every non-match → 400 "Invalid or already-used invite code" (identical to today's bad-code response). Response: `{ user, joined_household: boolean, household_full?: true, household_not_on_plan?: true }`. (The invitation code column and email text came in Task 5 — R-H9.)
- Shared: `addToHousehold(user, householdId): Promise<string | null>` (`services/household-membership.service.ts`) — used by join, accept and sign-up; returns "Already a member of a household", "Household has reached the 10-member limit", "Couldn't join the household. Try again." (profile update failed; nothing marked accepted), or null after joining and marking the caller's pending invitation to that household accepted.

- [ ] **Step 1: Failing tests:** invitation code + matching email (any case) → 201, user created, profile household set, invitation accepted, `joined_household: true`; formatted input "ABCDE-FGHJK" works; different email → 400 exact text, no user created; expired → same 400; revoked (row deleted) → same 400; household with 10 members → 201, `joined_household: false`, `household_full: true`, invitation stays pending; existing sign-up invite codes still work unchanged; the email body contains the invitation code and the signup URL with the url-encoded email, and still not the household join code; resending keeps the same invitation code.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement (the auth route stays under the 10-per-15-min auth limiter). **Step 4:** Run → pass; suite + tsc.
- [ ] **Step 5:** Commit `feat(auth): sign up from a household invitation`.

### Task 7: Members on any plan

**Files:**
- Create: `packages/api/src/middleware/require-household-plan.ts`
- Modify: `packages/api/src/index.ts` (household mounts no longer use a blanket `requireTier("pro")`), `packages/api/src/routes/households.ts` (per-route checks), the household dashboard and household report routes (find them: `routes/dashboard.ts`, `routes/reports.ts` household endpoints)
- Test: `packages/api/src/middleware/__tests__/require-household-plan.test.ts`, `households.test.ts`

**Interfaces:**
- Produces: `requireHouseholdPlan(mode: "caller" | "callerOrHead", { target?: "caller" | "paramId" | "joinCode" | "invitation" })` — `"caller"` = today's `requireTier("pro")`; `"callerOrHead"` = pass when the caller is Pro or the target household's head is Pro. The target is fixed per route (R-H15): `joinCode` = the household of the code in the body (`POST /join`), `invitation` = the household of `:invitationId` (accept), `paramId` = `req.params.id` (`/:id` routes; handlers check membership), `caller` (default) = the caller's own household — never a code or id from the body on other routes. Same 403 body as `requireTier` (`{ error: "Upgrade required", required_tier: "pro", current_tier }`). No-op when plan checks are off. Also `householdHeadOnPro(householdId)` for sign-up.
- Route modes (every household route is enumerated in `require-household-plan.test.ts`, R-H1): **caller** — `POST /` (create), `POST /invite`, `POST /invite-code`, `PATCH /` and their `/:id` forms; **callerOrHead** — `PUT /sharing` (caller), `POST /join` (joinCode), `POST /invitations/:id/accept` (invitation), `POST /:id/join` and `PUT /:id/sharing` (paramId), household dashboard and household report/export routes (caller); **open (any plan)** — `GET /` and `GET /:id` (R-H18), `GET /invitations` (R-H18), `DELETE /` and `/:id`, `POST /leave`, `POST /transfer` and `/:id/transfer`, `DELETE /members/:userId` and `/:id/members/:userId`, `DELETE /invitations/:id`, `GET /invitations/mine`, `POST /invitations/:id/decline` (R-H14).

- [ ] **Step 1: Failing tests:** free caller in a Pro head's household → GET household 200, leave 200, PUT sharing 200, household dashboard 200, household report 200; free caller → POST invite / invite-code / PATCH / DELETE / remove member / transfer → 403 required_tier pro (they're head-only anyway — assert the 403 is the plan message when the free caller is the head); free caller joining a Pro head's household by code → 200; joining a free head's household → 403; accepting an invitation to a Pro head's household → 200; head drops to free → members get 403 on GET; plan checks off → all 200.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; suite + tsc.
- [ ] **Step 5:** Commit `feat(households): members on any plan when the head is on Pro`.

### Task 8: Web — invite code card

**Files:**
- Modify: `packages/web/src/hooks/use-household.ts` (`useRotateInviteCode`), `packages/web/src/components/household/invite-form.tsx`
- Test: `packages/web/src/components/household/__tests__/invite-form.test.tsx`
- Create (first component tests in the web package — today it has only `src/lib/__tests__/savings-rate.test.ts` under `bun test src`): dev deps `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/user-event`; `packages/web/bunfig.toml` with `[test] preload = ["./src/test/setup.ts"]`; `src/test/setup.ts` registers happy-dom and provides a `renderWithQuery(ui)` helper wrapping a fresh `QueryClientProvider`. The existing savings-rate test must still pass.

**Interfaces:**
- Consumes: Task 2 endpoint; `formatInviteCode` from `@spendoza/shared`.
- Produces: `InviteForm({ inviteCode?: string })` — with no code it shows only "Get a new code" (no code box, Copy or Share). Confirm dialog (R-H16): title "Get a new code?", body "Anyone who has the old code won't be able to use it. People already in your household stay.", buttons "Cancel" / "Get a new code". `useRotateInviteCode` writes the new code into the cached household.

- [ ] **Step 1: Failing tests:** shows `formatInviteCode(code)`; "Copy" writes the raw formatted code to the clipboard; "Share" appears only when `navigator.share` exists and calls it with text "Join my household on Spendoza with code ABCDE-FGHJK"; "Get a new code" opens a confirm dialog with "Anyone who has the old code won't be able to use it. People already in your household stay." and on confirm calls the mutation and shows the new code.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; lint + typecheck.
- [ ] **Step 5:** Commit `feat(web): share and rotate the household invite code`.

### Task 9: Web — members, invitations, rename, delete

**Files:**
- Modify: `use-household.ts` (`useHouseholdInvitations`, `useRevokeInvitation`, `useRenameHousehold`, `useDeleteHousehold`), `components/household/member-list.tsx`, `invite-form.tsx` (email part), `pages/household-dashboard.tsx` (settings tab)
- Create: `components/household/pending-invitations.tsx`, `components/household/household-settings.tsx` (rename + delete)
- Test: matching `__tests__` files

**Interfaces (as built):**
- `apiClient` throws `ApiError { message, status, body }` (`src/lib/api-error.ts`, with `isPlanError` = body has `required_tier`, `isNotFoundError`); `apiClient` returns `undefined` for 204.
- `useHousehold()` returns `null` only for a 404 (not in a household); other errors (e.g. a plan 403) surface as errors. The household page shows the management view (members, leave, make head, remove, delete, revoke, pending invitations) on any plan.
- `components/plan-error.tsx`: `PlanRequired` ("Not available on your plan yet." + "Plans & billing" → `https://www.spendoza.io/pricing`) and `ActionError({ error, fallback })` (plan message for a plan refusal, otherwise the API text). Used by invite, get a new code, rename, join, accept/decline, sharing, and the household dashboard/goals tabs.
- Pending invitations show "Sent <date> · Expires <date>" and "Revoke". `useDeleteHousehold` empties the household cache, drops the invitation queries and invalidates `["household"]`, `["dashboard", "household"]` and `["goals"]`.

- [ ] **Step 1: Failing tests:** member actions read "Remove from household" (confirm text adds "Your invite code will change.") and "Make head of household"; invite by email shows "Invitation sent" on 200/201 and the API's message on 502; pending list shows email + "Expires <date>" and "Revoke"; rename saves and the page title updates; delete requires typing the exact name before "Delete household" enables, then routes to the no-household view.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement (head-only sections render only for the head). **Step 4:** Run → pass; lint + typecheck.
- [ ] **Step 5:** Commit `feat(web): manage members, invitations, name and deletion`.

### Task 10: Web — accept or decline an invitation

**Files:**
- Modify: `use-household.ts` (`useMyInvitations`, `useAcceptInvitation`, `useDeclineInvitation`), `pages/household-dashboard.tsx` (no-household view), `components/onboarding/household-step.tsx`, the web sign-up page (find it under `pages/`; reads `?invitation=` and `&email=` to prefill the code and email; field label "Invite code or invitation code"; after sign-up with `joined_household: true` lands on the household page, with `household_full: true` shows "That household is full now")
- Create: `components/household/my-invitations.tsx`
- Test: `__tests__/my-invitations.test.tsx`

**Interfaces (as built):**
- `useAcceptInvitation` / `useDeclineInvitation` take `{ id, code }` and POST `{ code }` (R-H9). `MyInvitation` is `{ id, household_name, inviter_name, expires_at }` — no code. Each row has an "Invitation code" field ("Enter the code from your invitation email."); `?invitation=<code>` prefills it only when there is exactly one invitation (R-H17).
- The login page returns to where the person was going (`state.from`, or a safe relative `?next=`), so a signed-out invitee following `/household?invitation=<code>` lands back there (R-H17).
- No-household view: Pro users see invitations + Create + Join; free users see invitations + Join with a code + "Upgrade to the Pro plan to create a household" (R-H18). The onboarding `household-step.tsx` is not rendered by the onboarding flow and was left unchanged.
- Sign-up: `signUp` returns `{ joined_household?, household_full?, household_not_on_plan? }`. `joined_household` → a notice "You've joined <Household>" (name from `GET /household`, else "the household") then Continue → onboarding (a new account must finish onboarding; the auth guard would send `/household` there anyway); `household_full` → "That household is full now"; `household_not_on_plan` → "That household isn't available on your plan yet".

- [ ] **Step 1: Failing tests:** sign-up page prefills code and email from `?invitation=ABCDE-FGHJK&email=a%40b.com` and shows the new label; with one invitation, shows "<Inviter> invited you to <Household>" with "Accept" and "Decline" above Create/Join; Accept → household view; expired → shows the API text; no invitations → component renders nothing.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; lint + typecheck + `bun run build` in `packages/web`.
- [ ] **Step 5:** Commit `feat(web): accept or decline household invitations`. Open the PR for Tasks 1–10 against `test` (API + web ship together).

### Task 11: App — household API and models (after the app foundation plan)

**Files:**
- Create: `apps/ios/Packages/SpendozaKit/Sources/SpendozaKit/Household/{Household,HouseholdAPI,InviteCode}.swift`, `Tests/SpendozaKitTests/{HouseholdAPITests,InviteCodeTests}.swift`
- Modify: `Sources/SpendozaKit/API/SpendozaAPI.swift`, `APIClient.swift`, the test stub

**Interfaces:**
- Produces: `struct Household { id, name, headID, inviteCode: String?, members: [Member] }`, `struct Member { id, displayName, incomeSharing, expenseSharing }`, `struct PendingInvitation { id, email, createdAt, expiresAt }`, `struct MyInvitation { id, householdName, inviterName, expiresAt }`; `enum InviteCode { static func normalize(_:) -> String; static func format(_:) -> String }` (same rules as Task 1's shared functions); on `SpendozaAPI`: `household() async throws -> Household?` (404 → nil), `createHousehold(name:)`, `joinHousehold(code:)`, `rotateInviteCode() -> String`, `renameHousehold(_:)`, `deleteHousehold(confirmName:)`, `invite(email:)`, `pendingInvitations()`, `revokeInvitation(id:)`, `myInvitations()`, `acceptInvitation(id:code:)`, `declineInvitation(id:code:)` (both POST `{ code }`; R-H9), `removeMember(id:)`, `makeHead(id:)`, `updateSharing(_:)`, `leaveHousehold()`. `MyInvitation` has no code (the person types it from the email; a `?invitation=` deep link may prefill it when there's one invitation). `signUp(...)` now returns `SignUpResult { joinedHousehold: Bool; householdFull: Bool; householdNotOnPlan: Bool }` (Task 6, R-H13). `household()` works on any plan (R-H18), so a member of a household whose head dropped below Pro still gets it; a 403 with `required_tier` on any household call maps to `.notOnPlan`, shown as "Not available on your plan yet" + Plans & billing. Invite errors include 429 "You just sent this invitation. Try again in a few minutes." and "Too many invitations. Try again later."; accept/decline/join 429 "Too many attempts. Try again in 15 minutes.".

- [ ] **Step 1: Failing tests:** `InviteCode` cases mirror Task 1's exactly; each call hits the path/method/body from Tasks 2–5; non-head decode → `inviteCode == nil`; 502 invite → `.message("Couldn't send the invitation email. Try again.")`.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** `scripts/test.sh` → pass.
- [ ] **Step 5:** Commit `ios: household API and invite codes`.

### Task 12: App — Home tab without a household

**Files:**
- Create: `apps/ios/Spendoza/Features/Home/{HomeModel,HomeView,NoHouseholdView,MyInvitationsSection,CreateHouseholdSheet,JoinHouseholdSheet}.swift`, `SpendozaTests/HomeModelTests.swift`
- Modify: `Spendoza/App/MainTabs.swift` (add Home between Plan's slot and Me per the spec's tab order, showing tabs that exist), `Spendoza/Features/Auth/SignUpView.swift` (label "Invite code or invitation code"; after sign-up with `joined_household` the Home tab opens; `household_full` shows "That household is full now")

**Interfaces:**
- Produces: `@MainActor @Observable final class HomeModel { enum State { case loading, none(invitations: [MyInvitation]), member(Household, isHead: Bool), notOnPlan, failed(String) }; func load() async; func accept(_:) async; func decline(_:) async; func create(name:) async throws; func join(code:) async throws }`.

- [ ] **Step 1: Failing tests:** no household + one invitation → `.none` with it; accept → reloads to `.member`; 403 plan → `.notOnPlan`; join sends `InviteCode.normalize`d input; join error text shown verbatim.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement views in the Banknote theme (ruled rows, one filled panel for invitations; "Not available on your plan yet" + Plans & billing for `.notOnPlan`). **Step 4:** Run → pass.
- [ ] **Step 5:** Commit `ios: Home tab — create, join, and household invitations`.

### Task 13: App — manage the household

**Files:**
- Create: `apps/ios/Spendoza/Features/Home/{HouseholdView,MembersSection,InviteCodeCard,InviteByEmailSheet,PendingInvitationsSection,SharingSettingsView,HouseholdSettingsView}.swift`, `SpendozaTests/HouseholdManagementTests.swift`, `SpendozaUITests/HouseholdUITests.swift`

- [ ] **Step 1: Failing tests:** head sees the code formatted, "Copy", `ShareLink` with the same text as the web, "Get a new code" (confirmation with the spec's sentence) → new code shown; non-head sees no code card; "Remove from household" confirmation includes "Your invite code will change."; "Make head of household"; pending invitations with "Revoke"; "Rename household"; "Delete household" enabled only after typing the exact name; "Leave household" disabled for a head with other members with the API's message; own sharing settings save. UI test: stubbed head flow — get a new code, revoke an invitation, remove a member.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** `scripts/test.sh` → pass, including `performAccessibilityAudit()` on HouseholdView.
- [ ] **Step 5:** Commit `ios: manage the household from the Home tab`. Ship in the next TestFlight build.
