# iOS Me and Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The full Me tab in the Spendoza iPhone app — profile and photo, report emails, PDF reports, invite codes, AI assistants, Plans & billing link, Support and Privacy, delete account — and the Admin dashboard and Users screens for admins, at parity with the web, plus the web/API gaps found on the way.

**Architecture:** API calls and their models go in `SpendozaKit` behind two new protocols, `AccountAPI` and `AdminAPI`, which `SpendozaAPI` refines, so the existing `APIClient` and the Debug `StubAPI` serve both. Each screen is a thin SwiftUI view over an `@Observable` model in the app target that takes `any SpendozaAPI`, tested with `StubAPI`. Support and Privacy text moves into JSON files in `packages/shared` that the web pages render and the app bundles, so the words can't drift. One API change: disabled accounts are refused.

**Tech Stack:** Swift 6, SwiftUI (iOS 26), Swift Testing, Swift Charts, PhotosUI, ImageIO, QuickLook; Express + bun:test; React + bun test/happy-dom.

**Spec:** [`../specs/2026-10-29-ios-app-design.md`](../specs/2026-10-29-ios-app-design.md) — "Me" and "Admin" under Structure. **Web reference:** [`2026-10-30-ios-me-admin-web-inventory.md`](2026-10-30-ios-me-admin-web-inventory.md) — every endpoint shape, error and copy string this plan relies on. Roadmap: Plan 6 of [`2026-10-29-ios-app-roadmap.md`](2026-10-29-ios-app-roadmap.md).

## Global Constraints

- Everything in Plan 2's Global Constraints still holds (iOS 26, Swift 6 strict concurrency, theme tokens, fonts, `scripts/test.sh` green before each commit, sentence-case copy).
- **No plan logic** (spec non-goal): never hide, badge or lock anything by plan. Showing the user's current plan name is fine. A 403 with `required_tier` shows `PlanNotAvailableView`.
- **Same words as the web**, from the inventory, in sentence case where the web uses title case (web "Weekly Email Reports" → app "Weekly email reports"). Support and Privacy text is shared data, never retyped.
- Plans & billing opens `https://www.spendoza.io/pricing` in the browser (spec: "Plans & billing ↗ spendoza.io").
- Me layout, top to bottom (spec): profile (photo, name, email, member since) · **Reports** (report emails, PDF reports) · **Account** (Appearance & Face ID, Invite codes, AI assistants, Plans & billing ↗, Admin — admins only) · **Help** (Support, Privacy) · Sign out · Delete my account. Rows appear only when their screen is real (a task adds its own row).
- Hairline ruled rows, 4 pt corners, one filled note-green panel per screen at most; destructive actions in `Theme.oxblood`.
- API base URL "test" check (for test-only features) reads the `APIBaseURL` Info.plist value: test-only when its host starts with `test-`.

## Decisions in this plan (owner can veto)

- **Disabled accounts are enforced** (web gap 1): `requireAuth` and the MCP session refuse a profile with `disabled = true` with 403 `{"error":"This account has been disabled. Email hello@gravitaz.net if you think this is a mistake.","code":"account_disabled"}`. Web and app sign out and show that text.
- **PDF periods in the app** mirror the web dashboard's: each of the last 12 months (newest first, the month in progress labelled "<Month> so far"), "Last 3 months", "This year", "Last year". The app shows the server's error text (the web drops it).
- **Admin Users on a phone** is a searchable list (25 per page, loads more at the bottom) with a detail screen per user, instead of a table. Same filters, same actions, same confirmation copy; actions apply immediately like the web.
- **Invite codes** get a share button (system share sheet) next to copy; share text: `Join me on Spendoza with invite code <CODE>: https://www.spendoza.io/signup`.
- **AI assistants** shows the web's setup steps, example questions and the three tool groups with their plan names as plain labels ("All plans", "Starter and Pro", "Pro") — no per-user badges or tool counts (no plan logic; the web's counts are hard-coded and drift).
- **Send test email** appears only in builds pointed at the test API, like the web.

## Review Focus

- **A huge photo** (48 MP HEIC from the library) is downscaled to ≤ 512 px and JPEG 0.85 before upload, never sent at full size and never rejected for size — test in Task 5.
- **Delete account as a household head with members**: the 409 message shows in the sheet, the account and session stay — test in Task 10.
- **PDF for a period with no data** shows "No report data available for this period", not an empty preview — test in Task 6.
- **Report schedule change fails** (offline): the toggle/day/hour snap back to the saved value and the error shows — test in Task 6.
- **Disconnect AI assistants keeps this phone signed in** (uses this phone's token; other sessions end) — test in Task 8.

---

### Task 1: Account API (SpendozaKit)

**Files:**
- Create: `Packages/SpendozaKit/Sources/SpendozaKit/API/AccountAPI.swift`, `.../API/Multipart.swift`, `.../Models/InviteCode.swift`, `.../Models/ReportPeriod.swift`, `Packages/SpendozaKit/Tests/SpendozaKitTests/AccountAPITests.swift`
- Modify: `.../Models/Profile.swift`, `.../API/SpendozaAPI.swift` (`SpendozaAPI: AccountAPI, AdminAPI` — declare an empty `AdminAPI` here if Task 2 hasn't landed), `.../API/APIClient.swift` (use `Multipart` for statements too), `.../API/Endpoints.swift`, `.../Session/SessionStore.swift`, `Spendoza/Debug/StubAPI.swift`
(paths under `apps/ios/`)

**Interfaces:**
- Produces:
  - `Profile` gains `avatarURL: URL?` (`avatar_url`), `emailReportDay: Weekday` (`email_report_day`, default `.saturday` when absent), `emailReportHour: Int` (default 9), `subscriptionTier: String` (default `"free"`), `createdAt: Date?`. Absent keys decode to the defaults; the existing memberwise init keeps working (new params defaulted).
  - `public enum Weekday: String, Codable, CaseIterable, Sendable { case monday … sunday; var title: String /* "Monday" */ }`
  - `ProfileChange` gains `displayName: String?` (`display_name`), `emailReportDay: Weekday?`, `emailReportHour: Int?`.
  - `public struct InviteCode: Codable, Sendable, Equatable, Identifiable { id, code: String; usedAt: Date?; createdAt: Date; var isUsed: Bool { usedAt != nil } }` (decode `used_by` too: used when either is non-null).
  - `public enum ReportPeriod: Hashable, Sendable { case month(Month); case range(from: Month, to: Month) }` — query: month → `month=YYYY-MM-01`; range → `from_date=<from>-01`, `to_date=<last day of to>`.
  - `public struct PDFFile: Sendable, Equatable { public let data: Data; public let filename: String }` — filename from `Content-Disposition`, else `spendoza-report.pdf`; reject a filename containing `/`.
  - `public protocol AccountAPI: Sendable { func uploadAvatar(jpegData: Data) async throws -> Profile; func signOutOtherSessions() async throws; func deleteAccount() async throws; func inviteCodes() async throws -> [InviteCode]; func createInviteCode() async throws -> InviteCode; func personalReportPDF(_ period: ReportPeriod) async throws -> PDFFile; func sendTestEmail() async throws }`
  - `SessionStore`: `public var email: String?` (from the stored Supabase session), `public func apply(_ profile: Profile)` (replaces `profile` and caches it the same way a profile load does), `public func accountDeleted() async` (local sign-out + `onSignOut`, no server call).
  - `StubAPI` implements `AccountAPI` with scriptable results (`avatarResult`, `inviteCodeList`, `createInviteCodeError`, `pdfResult: Result<PDFFile, APIError>`, `deleteAccountError`, `signOutOthersError`) and records calls.

- [ ] **Step 1: Write failing tests** in `AccountAPITests` with `StubURLProtocol`: a profile JSON with every new field decodes them; a profile without them gets `.saturday`, 9, `"free"`, nil; `uploadAvatar` sends `POST /api/profile/avatar` as multipart with a `file` part named `avatar.jpg`, `Content-Type: image/jpeg`; `deleteAccount` sends `DELETE /api/profile` with body `{"confirm":"DELETE"}`; a 409 maps to `.message("You're the head of a household …")`; `signOutOtherSessions` → `POST /api/profile/sign-out-others`; `createInviteCode` → `POST /api/invite-codes` body `{}`, 400 maps to `.message("Maximum of 3 invite codes allowed")`; `personalReportPDF(.month(Sep 2026))` requests `/api/reports/export/personal?month=2026-09-01` and returns the bytes with filename `spendoza-report-2026-09.pdf`; `.range(Aug 2026, Oct 2026)` sends `from_date=2026-08-01&to_date=2026-10-31`; a JSON 404 maps to `.message("No report data available for this period")`; `sendTestEmail` → `POST /api/emails/send-test`; `updateProfile(ProfileChange(emailReportDay: .monday, emailReportHour: 7))` sends only those two keys.
- [ ] **Step 2:** Run `swift test` in `Packages/SpendozaKit`; expect failures.
- [ ] **Step 3:** Implement. `Multipart.body(boundary:fileField:filename:mimeType:data:fields:) -> Data` replaces the inline builder in `uploadStatement` (behavior unchanged; its tests must still pass). `perform` returns the `HTTPURLResponse` for the PDF call so the filename can be read.
- [ ] **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: account API — photo, invite codes, PDF export, delete, sign out others`.

### Task 2: Admin API (SpendozaKit)

**Files:**
- Create: `Packages/SpendozaKit/Sources/SpendozaKit/API/AdminAPI.swift`, `.../Models/Admin.swift`, `Packages/SpendozaKit/Tests/SpendozaKitTests/AdminAPITests.swift`
- Modify: `.../API/APIClient.swift`, `.../API/Endpoints.swift`, `Spendoza/Debug/StubAPI.swift`

**Interfaces:**
- Produces:
  - `AdminStats { users: (totalUsers, freeUsers, starterUsers, proUsers, adminUsers: Int); activity: (totalTransactions, totalReports, totalEmailsSent, totalGoals, totalHouseholds: Int) }` as nested `Decodable` structs `AdminStats.Users`, `AdminStats.Activity`.
  - `AdminTrends { userTrends: [UserTrend(month: String, newUsers: Int)]; activityTrends: [ActivityTrend(month: String, metric: String, count: Int)]; llmStats: [LLMStat(month, callType: String, callCount, totalTokens: Int, avgTokens, minTokens, maxTokens: Int, totalCost: Double?)] }`.
  - `AdminUser: Identifiable { id, displayName: String; email: String?; tier: String; isAdmin, disabled: Bool; createdAt: Date }`, `AdminUserPage { users: [AdminUser]; total, page, limit: Int }`, `AdminUserQuery { page = 1, limit = 25, search: String?, tier: String? }` (empty search/tier omitted from the query), `AdminUserChange { isAdmin: Bool?, tier: String? (subscription_tier), disabled: Bool? }` (nil keys omitted).
  - Every count decodes from a JSON number **or** a numeric string (Postgres bigint/numeric can arrive as either) — one `FlexibleNumber` helper.
  - `public protocol AdminAPI: Sendable { func adminStats() async throws -> AdminStats; func adminTrends(months: Int) async throws -> AdminTrends; func adminUsers(_ q: AdminUserQuery) async throws -> AdminUserPage; func adminUpdateUser(id: String, _ change: AdminUserChange) async throws; func adminDeleteUser(id: String) async throws; func adminRegenerateReport(userID: String) async throws; func adminDetectRecurring(userID: String) async throws; func adminSendQuarterlyReport(userID: String) async throws; func adminSendAnnualReport(userID: String) async throws }` — paths per the inventory; the two send calls post no body (server defaults).

- [ ] **Step 1: Write failing tests:** stats decode with `"total_users": "12"` (string) and `5` (number); trends decode with `total_cost: null`; users query `AdminUserQuery(page: 2, search: "ann", tier: "pro")` → `/api/admin/users?page=2&limit=25&search=ann&tier=pro`, and `AdminUserQuery()` sends no `search`/`tier`; `adminUpdateUser(id: "u1", .init(tier: "starter"))` sends `PATCH /api/admin/users/u1` body exactly `{"subscription_tier":"starter"}`; 403 maps to `.message("Admin access required")`; delete 400 maps to `.message("Cannot delete your own account")`; each action hits its path with `POST`.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement. **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: admin API`.

### Task 3: Refuse disabled accounts (API, MCP, web, app)

**Files:**
- Modify: `packages/api/src/middleware/auth.ts`, `packages/mcp/src/auth/session.ts`, `packages/shared/src/constants.ts` (`ACCOUNT_DISABLED_CODE = "account_disabled"`, `ACCOUNT_DISABLED_MESSAGE`), `packages/web/src/lib/api.ts`, `packages/web/src/pages/login.tsx`, `apps/ios/Packages/SpendozaKit/Sources/SpendozaKit/API/{APIError,APIClient}.swift`, `.../Session/SessionStore.swift`, `apps/ios/Spendoza/Features/Auth/SignInView.swift`
- Test: `packages/api/src/middleware/__tests__/auth.test.ts` (create), `packages/mcp/src/__tests__/session.test.ts`, `packages/web/src/pages/__tests__/login.test.tsx`, `apps/ios/Packages/SpendozaKit/Tests/SpendozaKitTests/{APIClientTests,SessionStoreTests}.swift`

**Interfaces:**
- Produces: API 403 `{"error": ACCOUNT_DISABLED_MESSAGE, "code": "account_disabled"}` where `ACCOUNT_DISABLED_MESSAGE = "This account has been disabled. Email hello@gravitaz.net if you think this is a mistake."`; `createSessionFromToken` returns null for a disabled profile; Swift `APIError.accountDisabled(String)` (`userMessage` = the text); `SessionStore.signedOutNotice: String?` shown on Sign in.

- [ ] **Step 1: Write failing tests.** API: `requireAuth` with a valid token and `profiles.disabled = true` → 403 with that body and `next` not called; `disabled = false` or no profile row → `next` called (existing route tests keep passing because their mocks return no profile). MCP: disabled → `createSessionFromToken` returns null. Web: an API call answering 403 `code: "account_disabled"` signs out (Supabase `signOut` called) and the login page shows the message (passed in navigation state). iOS: 403 with that code → `.accountDisabled(text)`; `SessionStore.restore()` (and `refresh()`) getting `.accountDisabled` signs out and sets `signedOutNotice` to the text.
- [ ] **Step 2:** Run `cd packages/api && bun test src/middleware`, `cd packages/mcp && bun test`, `cd packages/web && bun test src/pages/__tests__/login.test.tsx`, `scripts/test.sh`; expect the new tests to fail.
- [ ] **Step 3:** Implement: after `getUser`, `supabaseAdmin.from("profiles").select("disabled").eq("id", user.id).maybeSingle()`; only `disabled === true` blocks. Same check in MCP. Web `apiClient` handles the code before throwing.
- [ ] **Step 4:** Run all four suites plus `bun run typecheck` at the root; expect pass.
- [ ] **Step 5:** Commit `fix: refuse disabled accounts in the API, MCP server, web and app`.

### Task 4: Support and Privacy text as shared data (web)

**Files:**
- Create: `packages/shared/src/content/support.json`, `packages/shared/src/content/privacy.json`, `packages/web/src/components/legal-content.tsx`, `packages/web/src/pages/__tests__/support-privacy.test.tsx`
- Modify: `packages/web/src/pages/support.tsx`, `packages/web/src/pages/privacy.tsx`, `packages/shared/src/index.ts` (export the content and its type)

**Interfaces:**
- Produces: JSON shape `{ "title": string, "intro": string[], "effective"?: string, "sections": [{ "heading": string, "blocks": [{ "p": string } | { "ol": string[] } | { "ul": string[] }] }], "footer": string }`. Inline links are Markdown `[text](href)` with `href` either `mailto:hello@gravitaz.net` or a site path (`/pricing`, `/support`, `/privacy`); `**bold**` where the page bolds. No other markup. TS type `LegalPage`. `LegalContent({ page }: { page: LegalPage })` renders it with the pages' existing classes (site paths as router `Link`s, mailto as `<a>`).

- [ ] **Step 1: Write failing test:** render `/support` and `/privacy`; every heading and paragraph text of the current pages is present (copy the current strings into the test as the expected list before moving them), the email link has `href="mailto:hello@gravitaz.net"`, "pricing page" links to `/pricing`, Privacy shows "Effective October 29, 2026".
- [ ] **Step 2:** Run; the test passes against the current pages (it pins today's text) — then switch the pages to `LegalContent` with empty JSON and confirm it fails.
- [ ] **Step 3:** Move the text into the JSON files verbatim; render from them.
- [ ] **Step 4:** Run `cd packages/web && bun test` and root `bun run typecheck`; expect pass. Compare both pages in the browser (dev server) against production: same text, same lists, same links.
- [ ] **Step 5:** Commit `web: support and privacy text from shared data`.

### Task 5: Me tab — profile and photo

**Files:**
- Create: `Spendoza/Features/Me/{MeModel,ProfileHeader,AvatarImage,EditNameSheet}.swift`, `SpendozaTests/{MeModelTests,AvatarImageTests}.swift`
- Modify: `Spendoza/Features/Me/MeView.swift` (restructure into the Global Constraints layout; Appearance & Face ID moves to its own screen under Account), `Spendoza/App/MainTabs.swift`

**Interfaces:**
- Consumes: `AccountAPI.uploadAvatar`, `SpendozaAPI.updateProfile`, `SessionStore.apply/email/profile` (Task 1).
- Produces: `@Observable @MainActor final class MeModel { init(api: any SpendozaAPI, profile: Profile?, apply: @escaping @MainActor (Profile) -> Void); var profile: Profile?; var error: String?; func saveName(_ name: String) async -> Bool; func uploadPhoto(_ imageData: Data) async; func update(_ change: ProfileChange) async -> Bool }` — successful calls set `profile` and pass the returned profile to `apply` (the view passes `store.apply`); `update` is reused by Task 6. `enum AvatarImage { static func jpegForUpload(_ data: Data, maxPixel: Int = 512, quality: Double = 0.85) -> Data? ; static func initials(_ name: String) -> String }`.

- [ ] **Step 1: Write failing tests:** `initials("Matt Mitchell") == "MM"`, `initials("cher") == "C"`, `initials("") == "?"`, three words → first two; `jpegForUpload` of a generated 8000×6000 PNG returns JPEG data whose image is 512×384 and under 5 MB, and of a 300×200 image keeps 300×200; `saveName("  Matt  ")` sends `display_name: "Matt"`, an empty name returns false without a call, 101 characters returns false with error "Use 100 characters or fewer"; `uploadPhoto` failure with `.message("Only JPEG, PNG, and WebP images are allowed")` sets `error` to it and leaves the profile.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Header: photo (AsyncImage of `avatarURL`, else initials on `Theme.card`), name, email, "Member since October 29, 2026". Tap photo → `PhotosPicker` (images) → `jpegForUpload` (ImageIO thumbnail, so HEIC works) → upload; progress over the photo. Tap name → `EditNameSheet` (field placeholder "Your name", "Save"). Account section: "Appearance & Face ID" row (existing controls moved to its screen) and "Plans & billing" row with detail "<Tier> plan" (capitalized) opening the pricing URL with an ↗ glyph. Sign out stays.
- [ ] **Step 4:** Run `scripts/test.sh`; expect pass. Check on the simulator in light and dark, largest text size.
- [ ] **Step 5:** Commit `ios: Me profile with photo upload and name`.

### Task 6: Reports — report emails and PDF reports

**Files:**
- Create: `Spendoza/Features/Me/{ReportEmailsSection,PDFReportsModel,PDFReportsView}.swift`, `SpendozaTests/{ReportEmailsTests,PDFReportsModelTests}.swift`
- Modify: `Spendoza/Features/Me/MeView.swift`

**Interfaces:**
- Consumes: `MeModel.update` (Task 5), `AccountAPI.personalReportPDF/sendTestEmail`, `ReportPeriod`, `PDFFile` (Task 1).
- Produces: `PDFReportsModel(api: any SpendozaAPI, now: Date, calendar: Calendar)` with `options: [PDFOption]` where `struct PDFOption: Identifiable { let title: String; let period: ReportPeriod }` and `func export(_ option: PDFOption) async -> URL?` (writes `PDFFile.data` to a fresh temp directory under its filename; sets `error` on failure); `var exporting: PDFOption.ID?`.

- [ ] **Step 1: Write failing tests:** toggling "Weekly email reports" off sends `email_reports_enabled: false`; a failed update (`.offline`) restores the previous toggle/day/hour and shows "You're offline. Check your connection and try again."; summary text for Saturday 9 in America/Chicago is `Receive your report every Saturday at 9 AM (America/Chicago)`; hour labels 0 → "12 AM", 12 → "12 PM", 13 → "1 PM". PDF options on 2026-10-30: first "October 2026 so far", then "September 2026" … 12 months, then "Last 3 months" = `.range(Aug 2026, Oct 2026)`, "This year" = `.range(Jan 2026, Oct 2026)`, "Last year" = `.range(Jan 2025, Dec 2025)`; `export` writes a file named `spendoza-report-2026-09.pdf` containing the stub bytes; a 404 stub sets `error` to "No report data available for this period" and returns nil.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Reports section: toggle "Weekly email reports" with "Receive your Spendoza financial report via email"; when on, Day and Time pickers and the summary line; in test-API builds only, "Send test email" with "Send yourself a report email now to verify the email pipeline." (states "Email sent" / error). "PDF reports" row → `PDFReportsView`: the options as ruled rows; tapping exports ("Exporting…") then opens the file with `.quickLookPreview` (which offers Share/Save).
- [ ] **Step 4:** Run `scripts/test.sh`; expect pass. Export a real month against the test API on the simulator.
- [ ] **Step 5:** Commit `ios: report email schedule and PDF reports`.

### Task 7: Invite codes

**Files:**
- Create: `Spendoza/Features/Me/{InviteCodesModel,InviteCodesView}.swift`, `SpendozaTests/InviteCodesModelTests.swift`
- Modify: `Spendoza/Features/Me/MeView.swift` (Account → "Invite codes")

**Interfaces:**
- Consumes: `AccountAPI.inviteCodes/createInviteCode`, `InviteCode` (Task 1).
- Produces: `InviteCodesModel(api:)` with `codes`, `canCreate` (`codes.count < 3`), `footer` ("{n} of 3 codes created"), `func load() async`, `func create() async`, `static func shareText(_ code: String) -> String`.

- [ ] **Step 1: Write failing tests:** load shows codes newest first; with 3 codes (one used) `canCreate` is false and the footer reads "3 of 3 codes created"; `create` appends the new code; a 400 shows "Maximum of 3 invite codes allowed"; `shareText("AB12CD34")` is `Join me on Spendoza with invite code AB12CD34: https://www.spendoza.io/signup`.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement: intro "Share codes with others to let them join Spendoza. You can create up to 3 codes."; empty "No invite codes yet. Create one to share."; rows with the code in a monospaced face, "Available"/"Used", and for available codes Copy (shows "Copied" for 2 s, VoiceOver label "Copy code") and Share (`ShareLink` with `shareText`); "Create code" ("Creating…"), disabled at 3. **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: invite codes`.

### Task 8: AI assistants

**Files:**
- Create: `Spendoza/Features/Me/{AIAssistantsModel,AIAssistantsView}.swift`, `SpendozaTests/AIAssistantsModelTests.swift`
- Modify: `Spendoza/Features/Me/MeView.swift` (Account → "AI assistants")

**Interfaces:**
- Consumes: `AccountAPI.signOutOtherSessions` (Task 1).
- Produces: `AIAssistantsModel(api:)` with `enum State { idle, disconnecting, done, failed(String) }`, `func disconnect() async`.

- [ ] **Step 1: Write failing tests:** `disconnect` calls `signOutOtherSessions` once and ends in `.done` (message "AI assistants and other sessions disconnected"); a stub `.message("Could not sign out other sessions. Please try again.")` ends in `.failed` with that text; the model has no sign-out path and the stub records only `signOutOtherSessions` (this phone stays signed in — the server keeps the caller's session).
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement the screen with the inventory's copy: title "Connect to AI assistants" and intro; the MCP URL with Copy; a segmented control "Claude Desktop / Claude Code / OpenAI / Other" showing each set of steps (config JSON and the `claude mcp add …` command copyable, monospaced); "What you can do" with the three groups of example questions; "Available tools" with the three groups labelled "All plans", "Starter and Pro", "Pro"; "Disconnect AI assistants" section with its explanation and an oxblood-outlined button ("Disconnecting…"). **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: AI assistants setup and disconnect`.

### Task 9: Help — Support and Privacy

**Files:**
- Create: `Spendoza/Features/Me/{LegalPage,LegalPageView}.swift`, `SpendozaTests/LegalPageTests.swift`
- Modify: `apps/ios/project.yml` (bundle `../../packages/shared/src/content/support.json` and `privacy.json` as app resources), `Spendoza/Features/Me/MeView.swift` (Help section)

**Interfaces:**
- Consumes: the JSON shape from Task 4.
- Produces: `struct LegalPage: Decodable { title, intro: [String], effective: String?, sections: [Section], footer: String }` with `Block` decoding `p`/`ol`/`ul`; `static func load(_ name: String, bundle: Bundle = .main) throws -> LegalPage`; `static func attributed(_ text: String) -> AttributedString` (Markdown links/bold; site paths become `https://www.spendoza.io<path>`).

- [ ] **Step 1: Write failing tests:** both bundled files load; Support has the heading "If a statement fails" and an ordered list of 5 items under "How it works"; `attributed("email [hello@gravitaz.net](mailto:hello@gravitaz.net)")` has a link `mailto:hello@gravitaz.net`; `attributed("the [pricing page](/pricing)")` links to `https://www.spendoza.io/pricing`; Privacy has `effective == "Effective October 29, 2026"`.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement `LegalPageView` (Newsreader title and section headings, Public Sans body, numbered and bulleted lists, footer). In the Help screens, links to `/support` and `/privacy` switch to the other screen in-app (an `OpenURLAction`); everything else opens normally (mailto → Mail). **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: support and privacy screens from the shared text`.

### Task 10: Delete my account

**Files:**
- Create: `Spendoza/Features/Me/{DeleteAccountModel,DeleteAccountSheet}.swift`, `SpendozaTests/DeleteAccountModelTests.swift`
- Modify: `Spendoza/Features/Me/MeView.swift`

**Interfaces:**
- Consumes: `AccountAPI.deleteAccount`, `SessionStore.accountDeleted` (Task 1).
- Produces: `DeleteAccountModel(api:, onDeleted: @MainActor () async -> Void)` with `typed: String`, `canDelete` (`typed == "DELETE"`, case-sensitive), `deleting: Bool`, `error: String?`, `func delete() async`.

- [ ] **Step 1: Write failing tests:** `canDelete` is false for "delete" and "DELETE " and true for "DELETE"; success calls `deleteAccount` then `onDeleted` once; the household-head 409 message lands in `error`, `onDeleted` is not called; a generic failure shows the server text, or "Failed to delete account" when there is none.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement: "Delete my account" (oxblood text button at the bottom of Me) → sheet "Delete your account?" with the web's description, field "Type DELETE to confirm" (no autocorrect/capitalization), "Cancel" and oxblood "Delete my account" ("Deleting…"), not dismissable while deleting; `onDeleted` → `store.accountDeleted()` (clears caches through `onSignOut`). **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: delete my account`.

### Task 11: Admin dashboard

**Files:**
- Create: `Spendoza/Features/Admin/{AdminDashboardModel,AdminDashboardView}.swift`, `SpendozaTests/AdminDashboardModelTests.swift`
- Modify: `Spendoza/Features/Me/MeView.swift` (Account → "Admin", only when `profile.isAdmin`)

**Interfaces:**
- Consumes: `AdminAPI.adminStats/adminTrends` (Task 2).
- Produces: `AdminDashboardModel(api:)` with `stats`, `trends`, `error`, `func load() async` (both calls in parallel), `var tiles: [AdminTile]` (`struct AdminTile { title, value, detail: String? }`), `var activitySeries: [(month: String, metric: String, count: Int)]`.

- [ ] **Step 1: Write failing tests:** tiles in order — Total users ("2 admins"), Subscribers = starter + pro ("5 free / 2 starter / 1 pro"), Transactions ("Total ingested"), Reports ("Total generated"), Emails sent, Goals, Households; numbers use grouping ("12,480"); activity series keeps only `transactions`, `reports`, `emails`; LLM cost formats `$0.0123`, nil → "—"; a 403 shows "Admin access required".
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement: "Admin" title, "Usage, users and reports across Spendoza."; tiles as a two-column ruled grid (Newsreader figures); Swift Charts "User signups" (line) and "Activity trends" (bars, three series in note / amber / engraving with a legend); "LLM token usage" as ruled rows per month and call type (calls, total tokens, avg/min/max, est. cost). The "Users" entry is added by Task 12. **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: admin dashboard`.

### Task 12: Admin users

**Files:**
- Create: `Spendoza/Features/Admin/{AdminUsersModel,AdminUsersView,AdminUserDetailModel,AdminUserDetailView}.swift`, `SpendozaTests/{AdminUsersModelTests,AdminUserDetailModelTests}.swift`
- Modify: `Spendoza/Features/Admin/AdminDashboardView.swift` ("Users")

**Interfaces:**
- Consumes: `AdminAPI` user calls (Task 2), `SessionStore.profile.id` (to block deleting yourself in the UI, matching the server's 400).
- Produces: `AdminUsersModel(api:)` with `search`, `tier: String?`, `users`, `total`, `func reload() async`, `func loadMore() async` (next page while `users.count < total`), `func replace(_ user: AdminUser)`, `func remove(id:)`; `AdminUserDetailModel(user:, api:, isSelf: Bool, onChange: (AdminUser) -> Void, onDeleted: () -> Void)` with `func setTier(_:) async`, `setAdmin(_:) async`, `setDisabled(_:) async` (optimistic, revert on failure), `func run(_ action: AdminAction) async -> String` returning the web's toast copy, `func delete() async`.

- [ ] **Step 1: Write failing tests:** reload with search "ann" and tier "pro" queries page 1 with both; `loadMore` asks page 2 and appends, stops when `users.count == total`; changing search resets to page 1; `setTier("starter")` sends `{"subscription_tier":"starter"}` and calls `onChange`; failure reverts and shows the error; `run(.regenerateReport)` returns "Report regenerated for Ann" or "Failed to regenerate report for Ann"; quarterly failure returns "Quarterly report failed: <message>"; delete success calls `onDeleted`; the 409 message shows; `isSelf` hides Delete.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement: "User management" with "{n} total users", search field "Search by name", tier menu "All tiers / Free / Starter / Pro", rows (name, email, tier, "Admin" and "Disabled" marks), load more at the bottom; detail: tier picker, "Admin" and "Disabled" toggles, action rows "Refresh report", "Detect recurring", "Send quarterly report", "Send annual report" (result shown under the row), "Delete user" → confirmation "Delete user" / "This will permanently delete {name} ({email}) and all their data. This cannot be undone." / "Cancel", "Delete user" ("Deleting…"). **Step 4:** Run `scripts/test.sh`; expect pass.
- [ ] **Step 5:** Commit `ios: admin users`.

### Task 13: Web parity fixes

**Files:**
- Modify: `packages/web/src/components/layout/bottom-nav.tsx` (More sheet: "Support", "Privacy", and "Admin" for admins), `packages/web/src/pages/admin-users.tsx` (show the delete error in the dialog, keep it open)
- Test: `packages/web/src/components/layout/__tests__/bottom-nav.test.tsx` (create), `packages/web/src/pages/__tests__/admin-users.test.tsx` (create)

- [ ] **Step 1: Write failing tests:** the More sheet lists Support (`/support`) and Privacy (`/privacy`) for everyone and Admin (`/admin`) only when `is_admin`; a delete answering 409 shows the server message in the dialog and the dialog stays open.
- [ ] **Step 2:** Run `cd packages/web && bun test`; expect failures. **Step 3:** Implement. **Step 4:** Run `bun test` and root `bun run typecheck`; expect pass.
- [ ] **Step 5:** Commit `web: support, privacy and admin in the mobile menu; show failed admin deletes`.

### Task 14: Screen check, docs and TestFlight

**Files:**
- Modify: `SpendozaUITests/{AccessibilityAuditUITests,LaunchArguments}.swift`, `Spendoza/Debug/{StubAPI,UITestStub}.swift` (an admin profile fixture with a photo URL, 2 invite codes, admin stats/trends/users fixtures), `docs/superpowers/plans/2026-10-29-ios-app-roadmap.md` (Plan 6 → shipped), `README.md` only if commands changed
- Create: `SpendozaUITests/MeFlowUITests.swift`

- [ ] **Step 1: Write UI tests:** `MeFlowUITests` — launch stubbed as an admin: Me shows the name, "Weekly email reports", "Invite codes", "AI assistants", "Plans & billing", "Admin", "Support", "Privacy", "Delete my account"; open Invite codes → "2 of 3 codes created"; open Support → "If a statement fails"; open Admin → "Total users", then Users → a user row → "Refresh report". A non-admin launch has no "Admin" row. Extend `AccessibilityAuditUITests` to Me, Invite codes, AI assistants, Support, Admin and a user's detail, light and dark, largest text size.
- [ ] **Step 2:** Run; fix every finding.
- [ ] **Step 3:** Run `scripts/test.sh` and the root `bun run test` / `bun run typecheck`; all pass.
- [ ] **Step 4:** Commit `ios: Me and Admin UI tests and accessibility audit`; after merge to main, dispatch the "iOS TestFlight" workflow and confirm the build processes.
