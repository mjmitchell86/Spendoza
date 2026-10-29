# Household Management and Invite Codes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A household head can manage the household and rotate its invite code, and invitations work end to end — on the API, the web and the iPhone app, with the same actions and words.

**Architecture:** API first (Tasks 1–5, each TDD in `packages/api`), then the web on the new endpoints (Tasks 6–8), then the iPhone Home tab's household screens (Tasks 9–11), which run after the app foundation plan has landed because they build on its `SpendozaAPI`, `Theme` and `MainTabs`. One shared helper deletes a household for both "last member leaves" and "Delete household".

**Tech Stack:** Express 4 + Zod (`packages/shared`), bun:test with the existing `mock.module` Supabase mocks, Resend; React + TanStack Query + shadcn/ui; Swift 6 / SwiftUI / Swift Testing.

**Spec:** [`../specs/2026-10-29-household-management-design.md`](../specs/2026-10-29-household-management-design.md). The app parts also follow [`../specs/2026-10-29-ios-app-design.md`](../specs/2026-10-29-ios-app-design.md) (Home tab, theme).

## Global Constraints

- Feature parity: every user-facing action in this plan exists on web **and** iPhone with the same label; API error strings are shown verbatim on both.
- Labels (exact): "Get a new code", "Copy", "Share", "Invite by email", "Pending invitations", "Revoke", "Accept", "Decline", "Rename household", "Delete household", "Remove from household", "Make head of household", "Leave household".
- Invite code: 10 chars, Crockford base-32 alphabet `0123456789abcdefghjkmnpqrstvwxyz`, stored lowercase, displayed uppercase as `ABCDE-FGHJK`. Old 8-hex codes stay valid until rotated. Join normalizes input: remove spaces and hyphens, lowercase.
- Only the head receives `invite_code` from the API.
- Invitations last 7 days (`household_invitations.expires_at`); the email never contains the code; link `https://www.spendoza.io/household`.
- Households stay behind `requireTier("pro")`; member limit 10 (members + pending invitations for invites, members for joins — unchanged).
- Branch from `origin/test`, PR against `test`. API: `bash run-tests.sh` and `npx tsc --noEmit -p .` in `packages/api`. Web: `bun run lint`, `bun run typecheck`, `bun run test` in `packages/web`. App: `apps/ios/scripts/test.sh`.

## Review Focus

- **A removed member tries the code they knew** → 400 "Invalid invite code" (the code rotated on removal) — test in Task 3.
- **A non-head member's GET of the household** has no `invite_code` key at all (not `null`, absent) — test in Task 2.
- **Accepting an expired or revoked invitation, or one for a different email** → 400 "This invitation has expired" / 404 "Invitation not found" (revoked and other-email look the same, so invitations can't be probed) — tests in Task 5.
- **Deleting a household** removes its household-owned reports, goals, debts, email jobs and email log rows, and never touches any member's personal (`entity_type = 'user'`) rows — test in Task 4.
- **The invitation email fails to send** → the invitation is kept pending and the API answers 502 "Couldn't send the invitation email. Try again." so Resend-on-retry works — test in Task 5.

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
- Produces: `POST /api/household/invite-code` (and `/:id/invite-code`), head only, no body → 200 `{ invite_code: string }`; 403 "Only the head of household can change the invite code". `GET /api/household` omits `invite_code` from `household` for non-heads. Internal: `async function rotateInviteCode(householdId: string): Promise<string>` — updates with `generateHouseholdCode()`, retrying up to 3 times on Postgres `23505` (unique violation), then throws.

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
- Produces: `PATCH /api/household` `{ name: string 1..100 }` → 200 household row (head only; 403 "Only the head of household can rename the household"). `DELETE /api/household` `{ confirm_name: string }` → 204 (head only; 403 "Only the head of household can delete the household"; 400 "Type the household name to confirm" when it doesn't match exactly). `deleteHousehold(householdId: string): Promise<void>` in `household.service.ts` — clears `profiles.household_id`, deletes `household_invitations`, deletes `reports`, `goals`, `debts`, `email_jobs`, `email_report_log` rows where `entity_type = 'household' and entity_id = householdId`, then the household. `leaveHandler`'s sole-member path calls it too.

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
  - `sendHouseholdInvitationEmail(to: string, inviterName: string, householdName: string): Promise<void>` — subject `"<Inviter> invited you to <Household> on Spendoza"`; body says sign in to accept at `https://www.spendoza.io/household`, and if they don't have an account to ask `<Inviter>` for a Spendoza invite code; no household code anywhere in it.
  - `POST /api/household/invite` `{ email }`: an existing pending, unexpired invitation for that email → update `expires_at = now() + 7 days` and resend (200 `{ message: "Invitation sent" }`); otherwise insert and send (201). Email failure → 502 `{ error: "Couldn't send the invitation email. Try again." }` with the row kept.
  - `GET /api/household/invitations` (head) → `[{ id, email, created_at, expires_at }]` pending and unexpired.
  - `DELETE /api/household/invitations/:id` (head; must belong to this household) → 204; else 404 "Invitation not found".
  - `GET /api/household/invitations/mine` (any signed-in user) → `[{ id, household_name, inviter_name, expires_at }]` pending, unexpired, for the caller's email.
  - `POST /api/household/invitations/:id/accept` → 200 `{ message: "Joined household successfully" }`; 404 "Invitation not found" (missing, revoked, declined, or another email); 400 "This invitation has expired"; plus the join checks ("Already a member of a household", 10-member limit). Marks it `accepted`.
  - `POST /api/household/invitations/:id/decline` → 204, marks it `declined` (404 as above).
  - These `/invitations…` routes are registered before the `/:id` routes and don't use `resolveHousehold` except the head ones.

- [ ] **Step 1: Failing tests** for every bullet above, including: the email body contains neither the current nor any 8/10-char code (assert `not.toContain(INVITE_CODE)`); resend path updates rather than inserts; Resend mock throwing → 502 and no delete of the row; accept with expired `expires_at` → 400 exact text; accept for another email → 404.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. Check `invitation_status` enum values in the initial migration; add a migration only if `declined`/`revoked` are missing (revoke deletes the row, so only `declined` may be needed). **Step 4:** Run → pass; suite + tsc.
- [ ] **Step 5:** Commit `feat(households): invitation emails, pending list, revoke, accept and decline`.

### Task 6: Web — invite code card

**Files:**
- Modify: `packages/web/src/hooks/use-household.ts` (`useRotateInviteCode`), `packages/web/src/components/household/invite-form.tsx`
- Test: `packages/web/src/components/household/__tests__/invite-form.test.tsx`
- Create (first component tests in the web package — today it has only `src/lib/__tests__/savings-rate.test.ts` under `bun test src`): dev deps `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/user-event`; `packages/web/bunfig.toml` with `[test] preload = ["./src/test/setup.ts"]`; `src/test/setup.ts` registers happy-dom and provides a `renderWithQuery(ui)` helper wrapping a fresh `QueryClientProvider`. The existing savings-rate test must still pass.

**Interfaces:**
- Consumes: Task 2 endpoint; `formatInviteCode` from `@spendoza/shared`.

- [ ] **Step 1: Failing tests:** shows `formatInviteCode(code)`; "Copy" writes the raw formatted code to the clipboard; "Share" appears only when `navigator.share` exists and calls it with text "Join my household on Spendoza with code ABCDE-FGHJK"; "Get a new code" opens a confirm dialog with "Anyone who has the old code won't be able to use it. People already in your household stay." and on confirm calls the mutation and shows the new code.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; lint + typecheck.
- [ ] **Step 5:** Commit `feat(web): share and rotate the household invite code`.

### Task 7: Web — members, invitations, rename, delete

**Files:**
- Modify: `use-household.ts` (`useHouseholdInvitations`, `useRevokeInvitation`, `useRenameHousehold`, `useDeleteHousehold`), `components/household/member-list.tsx`, `invite-form.tsx` (email part), `pages/household-dashboard.tsx` (settings tab)
- Create: `components/household/pending-invitations.tsx`, `components/household/household-settings.tsx` (rename + delete)
- Test: matching `__tests__` files

- [ ] **Step 1: Failing tests:** member actions read "Remove from household" (confirm text adds "Your invite code will change.") and "Make head of household"; invite by email shows "Invitation sent" on 200/201 and the API's message on 502; pending list shows email + "Expires <date>" and "Revoke"; rename saves and the page title updates; delete requires typing the exact name before "Delete household" enables, then routes to the no-household view.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement (head-only sections render only for the head). **Step 4:** Run → pass; lint + typecheck.
- [ ] **Step 5:** Commit `feat(web): manage members, invitations, name and deletion`.

### Task 8: Web — accept or decline an invitation

**Files:**
- Modify: `use-household.ts` (`useMyInvitations`, `useAcceptInvitation`, `useDeclineInvitation`), `pages/household-dashboard.tsx` (no-household view), `components/onboarding/household-step.tsx`
- Create: `components/household/my-invitations.tsx`
- Test: `__tests__/my-invitations.test.tsx`

- [ ] **Step 1: Failing tests:** with one invitation, shows "<Inviter> invited you to <Household>" with "Accept" and "Decline" above Create/Join; Accept → household view; expired → shows the API text; no invitations → component renders nothing.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; lint + typecheck + `bun run build` in `packages/web`.
- [ ] **Step 5:** Commit `feat(web): accept or decline household invitations`. Open the PR for Tasks 1–8 against `test` (API + web ship together).

### Task 9: App — household API and models (after the app foundation plan)

**Files:**
- Create: `apps/ios/Packages/SpendozaKit/Sources/SpendozaKit/Household/{Household,HouseholdAPI,InviteCode}.swift`, `Tests/SpendozaKitTests/{HouseholdAPITests,InviteCodeTests}.swift`
- Modify: `Sources/SpendozaKit/API/SpendozaAPI.swift`, `APIClient.swift`, the test stub

**Interfaces:**
- Produces: `struct Household { id, name, headID, inviteCode: String?, members: [Member] }`, `struct Member { id, displayName, incomeSharing, expenseSharing }`, `struct PendingInvitation { id, email, createdAt, expiresAt }`, `struct MyInvitation { id, householdName, inviterName, expiresAt }`; `enum InviteCode { static func normalize(_:) -> String; static func format(_:) -> String }` (same rules as Task 1's shared functions); on `SpendozaAPI`: `household() async throws -> Household?` (404 → nil), `createHousehold(name:)`, `joinHousehold(code:)`, `rotateInviteCode() -> String`, `renameHousehold(_:)`, `deleteHousehold(confirmName:)`, `invite(email:)`, `pendingInvitations()`, `revokeInvitation(id:)`, `myInvitations()`, `acceptInvitation(id:)`, `declineInvitation(id:)`, `removeMember(id:)`, `makeHead(id:)`, `updateSharing(_:)`, `leaveHousehold()`.

- [ ] **Step 1: Failing tests:** `InviteCode` cases mirror Task 1's exactly; each call hits the path/method/body from Tasks 2–5; non-head decode → `inviteCode == nil`; 502 invite → `.message("Couldn't send the invitation email. Try again.")`.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** `scripts/test.sh` → pass.
- [ ] **Step 5:** Commit `ios: household API and invite codes`.

### Task 10: App — Home tab without a household

**Files:**
- Create: `apps/ios/Spendoza/Features/Home/{HomeModel,HomeView,NoHouseholdView,MyInvitationsSection,CreateHouseholdSheet,JoinHouseholdSheet}.swift`, `SpendozaTests/HomeModelTests.swift`
- Modify: `Spendoza/App/MainTabs.swift` (add Home between Plan's slot and Me per the spec's tab order, showing tabs that exist)

**Interfaces:**
- Produces: `@MainActor @Observable final class HomeModel { enum State { case loading, none(invitations: [MyInvitation]), member(Household, isHead: Bool), notOnPlan, failed(String) }; func load() async; func accept(_:) async; func decline(_:) async; func create(name:) async throws; func join(code:) async throws }`.

- [ ] **Step 1: Failing tests:** no household + one invitation → `.none` with it; accept → reloads to `.member`; 403 plan → `.notOnPlan`; join sends `InviteCode.normalize`d input; join error text shown verbatim.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement views in the Banknote theme (ruled rows, one filled panel for invitations; "Not available on your plan yet" + Plans & billing for `.notOnPlan`). **Step 4:** Run → pass.
- [ ] **Step 5:** Commit `ios: Home tab — create, join, and household invitations`.

### Task 11: App — manage the household

**Files:**
- Create: `apps/ios/Spendoza/Features/Home/{HouseholdView,MembersSection,InviteCodeCard,InviteByEmailSheet,PendingInvitationsSection,SharingSettingsView,HouseholdSettingsView}.swift`, `SpendozaTests/HouseholdManagementTests.swift`, `SpendozaUITests/HouseholdUITests.swift`

- [ ] **Step 1: Failing tests:** head sees the code formatted, "Copy", `ShareLink` with the same text as the web, "Get a new code" (confirmation with the spec's sentence) → new code shown; non-head sees no code card; "Remove from household" confirmation includes "Your invite code will change."; "Make head of household"; pending invitations with "Revoke"; "Rename household"; "Delete household" enabled only after typing the exact name; "Leave household" disabled for a head with other members with the API's message; own sharing settings save. UI test: stubbed head flow — get a new code, revoke an invitation, remove a member.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** `scripts/test.sh` → pass, including `performAccessibilityAudit()` on HouseholdView.
- [ ] **Step 5:** Commit `ios: manage the household from the Home tab`. Ship in the next TestFlight build.
