# iOS App Foundation and Health — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TestFlight build of the Spendoza iPhone app with sign-in, onboarding, Face ID lock, the Health tab and its full drill-down, home/lock-screen widgets and the monthly check-up notification.

**Architecture:** An XcodeGen project in `apps/ios/` modeled on `~/dev/CharadeFam/apps/ios`: a SwiftUI app target, a WidgetKit extension, and a local Swift package `SpendozaKit` that holds everything testable without UI — API client, models, score and drill-down math, check-up month rules, widget snapshot. Views stay thin over `@Observable` models that take a `SpendozaAPI` protocol, so models are tested with a stub.

**Tech Stack:** Swift 6, SwiftUI, iOS 26, Swift Testing, WidgetKit, BackgroundTasks, LocalAuthentication, `supabase-swift` (Auth only), XcodeGen, fastlane, GitHub Actions.

**Spec:** [`../specs/2026-10-29-ios-app-design.md`](../specs/2026-10-29-ios-app-design.md). Mockups: [`../specs/2026-10-29-ios-app-mockups/`](../specs/2026-10-29-ios-app-mockups/) (`drilldown.png` is the reference for Tasks 8–10).

## Global Constraints

- Deployment target iOS **26.0**; Swift 6 strict concurrency. iPhone only (`TARGETED_DEVICE_FAMILY: 1`), portrait.
- Bundle IDs (owner creates them in the Apple Developer account, Task 13): app `com.gravitaz.spendoza`, widgets `com.gravitaz.spendoza.widgets`; App Group `group.com.gravitaz.spendoza`.
- API base URL per configuration: Dev `https://test-api.spendoza.io`, Prod `https://api.spendoza.io`. Supabase URL/anon key per environment from xcconfig (values from `packages/web/.env` equivalents; anon keys are public).
- Every API call sends `Authorization: Bearer <Supabase access token>`.
- Theme tokens exactly as the spec: paper `#E9EEE6`, card `#F4F7F2`, note `#1E4A3B`, ink `#1A2620`, soft `#4A5A52`, engraving `#9DB3A6`, amber `#A8701A`, oxblood `#8E2B2B`. Fonts Newsreader (titles, section titles, scores, money) and Public Sans (everything else), bundled with their OFL licences.
- Score bands: Low 0–39 (oxblood), Fair 40–69 (amber), Good 70–100 (note).
- `savings_rate` and every `*_ratio` value from the API are already percentages; never multiply by 100.
- Copy: sentence case, active voice. Fixed strings: notification body `Your <Month> check-up is ready` (no numbers); dial label `Health score <n> of 100, <Band>, <down|up> <d> since <Month>` (or `, same as <Month>` when unchanged, omitted when there's no previous score).
- The widget's shared data is only score, band, previous score and month.
- No plan logic: a 403 with `required_tier` shows "Not available on your plan yet" + the Plans & billing link (`https://www.spendoza.io/pricing`); nothing is hidden by plan.
- Tabs appear only when real: this plan ships **Health** and a minimal **Me** (Appearance & Face ID, Sign out). "Ask the advisor" and debt actions stay hidden until Plan 4.
- Tests: `scripts/test.sh` runs `swift test` in `Packages/SpendozaKit` and `xcodebuild test` for the app scheme on the latest iPhone simulator; both must pass before each commit.

## Review Focus

- **A brand-new account with no reports**: Health shows the empty state ("Add your first statement") rather than a zero dial or an error — test in Task 9.
- **The first month ever** (no previous report): no "down N", no dashed last-month needle, part deltas show nothing rather than `±0` — tests in Tasks 3 and 8.
- **Offline or API down after a successful earlier load**: Health shows the cached last check-up with "Last updated <date>", not a blank screen — test in Task 9.
- **A plan-gated call (403 `required_tier`)** — e.g. creating a budget goal while goals are gated — shows the plan message instead of failing silently — test in Task 10.
- **Statement too large** for the production API (verify the real limit in Task 6; ~4.5 MB on Vercel) is rejected on the phone with "This file is too large (max N MB)" before uploading — test in Task 5; the limit itself is measured in Task 6.

---

### Task 1: Project scaffold, CI test script

**Files:**
- Create: `apps/ios/project.yml`, `apps/ios/Configurations/{Dev,Prod}.xcconfig`, `apps/ios/Spendoza/App/SpendozaApp.swift`, `apps/ios/Spendoza/Info.plist`, `apps/ios/Spendoza/PrivacyInfo.xcprivacy`, `apps/ios/Spendoza/Spendoza.entitlements` (App Group), `apps/ios/Packages/SpendozaKit/Package.swift`, `apps/ios/Packages/SpendozaKit/Sources/SpendozaKit/SpendozaKit.swift`, `apps/ios/Packages/SpendozaKit/Tests/SpendozaKitTests/SmokeTests.swift`, `apps/ios/SpendozaTests/AppSmokeTests.swift`, `apps/ios/scripts/test.sh`, `apps/ios/.gitignore` (`*.xcodeproj`, `build/`), `.github/workflows/ios-ci.yml`
- Modify: `README.md` (an "iOS app" section: `brew install xcodegen`, `cd apps/ios && xcodegen && open Spendoza.xcodeproj`, `scripts/test.sh`)

**Interfaces:**
- Produces: targets `Spendoza` (app), `SpendozaTests`, `SpendozaUITests`; package `SpendozaKit` (platforms iOS 26, macOS 15 so `swift test` runs on the host); Info.plist keys `APIBaseURL`, `SupabaseURL`, `SupabaseAnonKey` read from xcconfig; `supabase-swift` (Auth product) added as a package dependency of `SpendozaKit`.

- [ ] **Step 1:** Write `SmokeTests.swift` (`@Test func packageLoads() { #expect(SpendozaKit.version == "0.1.0") }`) and `AppSmokeTests.swift` (reads `Bundle.main.object(forInfoDictionaryKey: "APIBaseURL")` and expects `https://test-api.spendoza.io` in Debug).
- [ ] **Step 2:** Run `scripts/test.sh`; expect failure (no project).
- [ ] **Step 3:** Write `project.yml` following CharadeFam's (`options.deploymentTarget.iOS: "26.0"`, `SWIFT_VERSION: "6.0"`, `MARKETING_VERSION: "0.1.0"`, configFiles per configuration) and the rest of the scaffold; `ios-ci.yml` runs on `macos-latest` on PRs touching `apps/ios/**`: install xcodegen, `xcodegen`, `scripts/test.sh`.
- [ ] **Step 4:** Run `scripts/test.sh`; expect both suites to pass.
- [ ] **Step 5:** Commit `ios: scaffold the Spendoza app, SpendozaKit package and CI`.

### Task 2: Theme and typography

**Files:**
- Create: `apps/ios/Spendoza/DesignSystem/Theme.swift`, `apps/ios/Spendoza/DesignSystem/Typography.swift`, `apps/ios/Spendoza/DesignSystem/Components.swift` (`RuledRow`, `SuggestionPanel`, `OutlinedPanel`, `PrimaryButtonStyle`, `SecondaryButtonStyle`, `EngravedBars`), `apps/ios/Spendoza/Resources/Fonts/*` (Newsreader variable + Public Sans Regular/SemiBold, `OFL.txt`), `apps/ios/SpendozaTests/ThemeContrastTests.swift`

**Interfaces:**
- Produces: `enum Theme { static let paper, card, note, ink, soft, engraving, amber, amberText, oxblood: Color }` — each a light/dark dynamic color; `Theme.contrastRatio(_ a: RGB, _ b: RGB) -> Double`; `extension Font { static func serif(_ size: CGFloat, relativeTo: Font.TextStyle) -> Font; static func sans(_ size: CGFloat, weight: Font.Weight = .regular, relativeTo: Font.TextStyle) -> Font }`; `extension ScoreBand { var color: Color }` (band type from Task 3 — add the extension in Task 3 if this task lands first).

- [ ] **Step 1:** Write `ThemeContrastTests`: for each text pairing used (ink/paper, soft/paper, ink/card, `amberText`/paper, oxblood/paper, card-on-note text `#F4F7F2`/note) in light **and** dark, `#expect(Theme.contrastRatio(fg, bg) >= 4.5)`; and `#expect(Theme.contrastRatio(.amber, .paper) < 4.5)` documenting why `amberText` exists.
- [ ] **Step 2:** Run; expect failure.
- [ ] **Step 3:** Implement tokens (light values from Global Constraints; `amberText` is a darker amber that passes; dark palette: paper `#13241D`, card `#1A2E26`, ink `#E8EFE9`, soft `#A9BDB2`, engraving `#3E5A4D`, note `#7FB89C`, amber `#D6A04A`, oxblood `#E07A72`, adjusted until every pairing passes), fonts registered via `UIAppFonts`, components matching the mockups (hairline `engraving` rules, 4 pt corners, one filled `note` suggestion panel).
- [ ] **Step 4:** Run; expect pass.
- [ ] **Step 5:** Commit `ios: Banknote theme, typography and base components`.

### Task 3: Score models and drill-down math (SpendozaKit)

**Files:**
- Create: `Packages/SpendozaKit/Sources/SpendozaKit/Models/{Month,Report,Category,Transaction,Profile}.swift`, `Sources/SpendozaKit/Score/{ScoreBand,ScorePart,PartChange,CategoryChange,Suggestions}.swift`, `Tests/SpendozaKitTests/{ReportDecodingTests,ScoreTests,SuggestionTests}.swift`, `Tests/SpendozaKitTests/Fixtures/report-2026-10.json`, `report-2026-09.json` (real shapes from `GET /api/reports/personal`)

**Interfaces:**
- Produces:
  - `struct Month: Hashable, Comparable, Codable, Sendable { let year: Int; let month: Int; init(date: Date, calendar: Calendar); init?(apiString: String) /* "2026-10-01" */; var apiString: String; var previous: Month; var name: String /* "October" */ }`
  - `struct Report: Decodable, Sendable { let month: Month; let data: ReportData; let insights: [String] /* ai_insights split into bullet lines; [] when null */; let generatedAt: Date }`
  - `struct ReportData: Decodable, Sendable { let totalIncome, totalExpenses, savingsRate: Double; let byCategory: [CategoryAmount]; let health: HealthScore? }`
  - `struct HealthScore: Decodable, Sendable { let score: Int; let previousScore: Int?; let parts: [ScorePart: PartScore] }`, `struct PartScore: Decodable, Sendable { let value: Double; let points: Int; let max: Int; let rating: Rating }`, `enum Rating: String, Decodable { case good, ok, warning, critical }`
  - `enum ScorePart: String, CaseIterable, Sendable { case savingsRate = "savings_rate", needs = "needs_ratio", wants = "wants_ratio", emergencyFund = "emergency_fund", debtToIncome = "debt_to_income"; var title: String /* "Savings rate", "Needs", "Wants", "Emergency fund", "Debt vs. income" */; func rule(value: Double) -> String; var budgetClass: BudgetClass? /* needs → .need, wants → .want */ }`
  - `enum ScoreBand: Sendable { case low, fair, good; init(score: Int); var name: String }`
  - `struct PartChange: Sendable { let part: ScorePart; let points: Int; let max: Int; let delta: Int? }`, `func partChanges(current: HealthScore, previous: HealthScore?) -> [PartChange]` (in `ScorePart.allCases` order)
  - `struct CategoryChange: Sendable { let category: String; let amount: Double; let delta: Double? }`, `func categoryChanges(current: ReportData, previous: ReportData?, budgetClass: BudgetClass, categories: [Category]) -> [CategoryChange]` (only that class's categories; sorted by `delta` descending, nil deltas last)
  - `struct Category: Decodable, Sendable { let id: String; let name: String; let budgetClass: BudgetClass }`, `enum BudgetClass: String, Decodable { case need, want, savings, other }`
  - `struct Suggestion: Sendable, Equatable { let title: String; let detail: String; let action: SuggestionAction }`, `enum SuggestionAction: Sendable, Equatable { case setBudget(categoryID: String, categoryName: String, amount: Int), openEmergencyFund, none }`, `func suggestions(current: Report, previous: Report?, categories: [Category]) -> [Suggestion]`

- [ ] **Step 1: Write failing tests:**
  - `ReportDecodingTests`: the October fixture decodes; `health.score == 64`, `health.previousScore == 73`, `parts[.wants]?.points == 9`, `parts[.savingsRate]?.value == 16.0` (not 1600); `insights` splits the bullet text into lines; a report with `"financial_health_score"` absent decodes with `health == nil`; `Month(apiString: "2026-10-01")?.name == "October"`.
  - `ScoreTests`: `ScoreBand(score: 39) == .low`, `40 == .fair`, `69 == .fair`, `70 == .good`; `partChanges(current: oct, previous: sep)` gives wants `delta == -6`; with `previous: nil` every `delta == nil`; `categoryChanges(... budgetClass: .want ...)` first item is `Dining out` with `delta == 310` and excludes `Housing` (a need); a category new this month has `delta == nil`; `ScorePart.wants.rule(value: 34)` == `"Full points while wants stay at or under 30% of your income. This month came in at 34%."`.
  - `SuggestionTests`: when wants lost the most points, the first suggestion is `.setBudget(categoryName: "Dining out", amount: 250)` where amount = the category's average over the prior months in the fixtures rounded **up** to the nearest 50 (spec: "Set a $X budget"; derive X this way — document the rule in a comment); emergency fund under 3 months adds `.openEmergencyFund`; no previous report → suggestions from the current month only, no "cost you N points" wording; at most 3 suggestions.
- [ ] **Step 2:** `swift test` in the package; expect failures.
- [ ] **Step 3:** Implement. Rule text per part comes from the spec's factor table (savings ≥ 20%, needs ≤ 50%, wants ≤ 30%, emergency fund 6 months for full points, debt payments ≤ 10% of income).
- [ ] **Step 4:** `swift test`; expect pass.
- [ ] **Step 5:** Commit `ios: score, report and drill-down models`.

### Task 4: Check-up month rules and widget snapshot (SpendozaKit)

**Files:**
- Create: `Sources/SpendozaKit/Checkup/{CheckupMonth,CheckupNotice}.swift`, `Sources/SpendozaKit/Widget/WidgetSnapshot.swift`, `Tests/SpendozaKitTests/{CheckupMonthTests,WidgetSnapshotTests}.swift`

**Interfaces:**
- Produces: `func checkupMonth(now: Date, calendar: Calendar, reportMonths: Set<Month>) -> Month?` (latest month strictly before the current month that has a report); `func soFarMonth(now: Date, calendar: Calendar) -> Month`; `func checkupNotice(latestCheckup: Month?, lastNotified: Month?) -> String?` (returns `"Your October check-up is ready"` only when `latestCheckup` is newer than `lastNotified`); `struct WidgetSnapshot: Codable, Equatable, Sendable { let score: Int; let band: ScoreBand; let previousScore: Int?; let month: Month }` (make `ScoreBand` `Codable`); `final class SnapshotStore: Sendable { init(appGroup: String); func save(_ s: WidgetSnapshot); func load() -> WidgetSnapshot? }`.

- [ ] **Step 1: Write failing tests:** on 2026-11-14 with reports for Sep, Oct and Nov → checkup is Oct (Nov is in progress); with only Nov → nil; on 2026-11-01 00:05 local with Oct present → Oct; `soFarMonth` → Nov; `checkupNotice(latestCheckup: Oct, lastNotified: Sep) == "Your October check-up is ready"`, same month → nil, nil last → notice; `WidgetSnapshot` JSON encodes exactly the keys `score`, `band`, `previousScore`, `month` (assert the decoded dictionary's key set) and round-trips; `SnapshotStore` round-trips through a temporary suite name.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement. **Step 4:** Run; expect pass.
- [ ] **Step 5:** Commit `ios: check-up month rules and widget snapshot`.

### Task 5: API client (SpendozaKit)

**Files:**
- Create: `Sources/SpendozaKit/API/{SpendozaAPI,APIClient,APIError,Endpoints}.swift`, `Tests/SpendozaKitTests/APIClientTests.swift`, `Tests/SpendozaKitTests/Support/StubURLProtocol.swift`

**Interfaces:**
- Produces: `protocol SpendozaAPI: Sendable` with
  `func profile() async throws -> Profile` (`GET /api/profile`; `Profile { id, displayName, onboardingCompleted, isAdmin, emailReportsEnabled, householdID: String? }`),
  `func completeOnboarding() async throws` (`PUT /api/profile/onboarding`),
  `func updateProfile(_ change: ProfileChange) async throws -> Profile` (`PUT /api/profile`; `ProfileChange { emailReportsEnabled: Bool?; timezone: String? }`),
  `func personalReport(_ month: Month) async throws -> Report?` (`GET /api/reports/personal?month=<apiString>`; 404 → `nil`),
  `func categories() async throws -> [Category]` (`GET /api/categories`),
  `func transactions(from: Date, to: Date) async throws -> [Transaction]` (`GET /api/transactions?from_date=&to_date=`; `Transaction { id, date, description, amount, type, category: String? /* ai_category */ }`),
  `func setCategory(transactionID: String, category: String) async throws` (`PUT /api/transactions/:id` `{ ai_category }`),
  `func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws` (`POST /api/goals` `{ name, goal_type: "budget", category_id, target_amount }`),
  `func uploadStatement(fileURL: URL, mimeType: String) async throws -> Statement` (`POST /api/bank-statements`, multipart field `file`),
  `func statements() async throws -> [Statement]` (`GET /api/bank-statements`; `Statement { id, status: StatementStatus /* uploaded, processing, parsed, failed */, fileName, errorMessage: String? }`),
  `func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws` (`POST /api/auth/signup`),
  `func joinWaitlist(name: String, email: String) async throws` (`POST /api/auth/waitlist`);
  `final class APIClient: SpendozaAPI { init(baseURL: URL, session: URLSession = .shared, accessToken: @escaping @Sendable () async -> String?) }`;
  `enum APIError: Error, Equatable { case unauthorized, notOnPlan(requiredTier: String), fileTooLarge(maxMB: Int), message(String) /* server's error text */, offline }`;
  `static let maxStatementBytes: Int` (Task 6 sets the verified value).

- [ ] **Step 1: Write failing tests** with `StubURLProtocol`: every request carries `Authorization: Bearer tok`; `personalReport` builds `month=2026-10-01` and maps 404 → nil; a 403 `{"error":"Upgrade required","required_tier":"starter"}` → `.notOnPlan(requiredTier: "starter")`; 401 → `.unauthorized`; a 400 `{"error":"Invalid invite code"}` → `.message("Invalid invite code")`; `URLError.notConnectedToInternet` → `.offline`; `createBudgetGoal` sends exactly `goal_type: "budget"` with the category id and amount; `uploadStatement` sends multipart with field name `file` and throws `.fileTooLarge` without making a request when the file exceeds `maxStatementBytes`.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement (snake_case ↔ camelCase via `JSONDecoder.keyDecodingStrategy`). **Step 4:** Run; expect pass.
- [ ] **Step 5:** Commit `ios: Spendoza API client`.

### Task 6: Sign-in, sign-up, waitlist, session and app phases

**Files:**
- Create: `Sources/SpendozaKit/Session/{SessionStore,AppPhase}.swift`, `Tests/SpendozaKitTests/AppPhaseTests.swift`, `Spendoza/Features/Auth/{SignInView,SignUpView,WaitlistView}.swift`, `Spendoza/App/RootView.swift`
- Modify: `Spendoza/App/SpendozaApp.swift`, `Sources/SpendozaKit/API/APIClient.swift` (`maxStatementBytes`)

**Interfaces:**
- Consumes: `SpendozaAPI.profile/signUp/joinWaitlist` (Task 5).
- Produces: `enum AppPhase: Equatable { case signedOut, onboarding, ready(isAdmin: Bool) }`, `func appPhase(session: Bool, profile: Profile?) -> AppPhase`; `@MainActor @Observable final class SessionStore { var phase: AppPhase; func signIn(email:password:) async throws; func signOut() async; func refresh() async; var accessToken: String? { get async } }` wrapping `SupabaseClient.auth` (restores the stored session on launch).

- [ ] **Step 1: Write failing tests:** no session → `.signedOut`; session + `onboardingCompleted == false` → `.onboarding`; session + completed → `.ready(isAdmin:)` carrying the flag.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement `appPhase` and `SessionStore`; views: Sign in (email, password, "Sign in"; errors inline), Sign up (name, email, password ≥ 8, invite code; server message shown for bad codes), Join the waitlist (name, email; "You're on the list" confirmation). `RootView` switches on `phase`.
- [ ] **Step 4: Verify the real upload limit** against `https://test-api.spendoza.io`: upload test PDFs of 4 MB and 5 MB with a test account; set `maxStatementBytes` to the largest size that succeeds (expected 4.5 MB) and record the result in the commit message.
- [ ] **Step 5:** Run tests; expect pass. Manually sign in on the simulator against test. Commit `ios: sign in, sign up, waitlist and app phases`.

### Task 7: Face ID lock and the minimal Me tab

**Files:**
- Create: `Sources/SpendozaKit/Lock/AppLock.swift`, `Tests/SpendozaKitTests/AppLockTests.swift`, `Spendoza/Features/Lock/LockView.swift`, `Spendoza/Features/Me/MeView.swift`, `Spendoza/App/MainTabs.swift`
- Modify: `Spendoza/App/RootView.swift`

**Interfaces:**
- Produces: `protocol Authenticator: Sendable { func authenticate(reason: String) async -> Bool }` (LocalAuthentication `.deviceOwnerAuthentication`, so passcode works too); `@MainActor @Observable final class AppLock { init(authenticator: Authenticator, isEnabled: Bool); var isLocked: Bool; func appDidBecomeActive() async; func appDidEnterBackground() }` — `isEnabled` persisted in `UserDefaults` key `faceIDLockEnabled`, default `true`. `MainTabs` is a `TabView` with the system iOS 26 tab bar style and only the tabs that exist: Health, Me. Tab icons: custom symbol images matching the mockups (gauge, person) in the asset catalog.

- [ ] **Step 1: Write failing tests:** enabled + launch → locked until `authenticate` returns true; failed auth stays locked; disabled → never locked; background then active → locks again.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement; `MeView` has "Appearance & Face ID" (toggle, theme Light / Dark / System) and "Sign out". **Step 4:** Run; expect pass.
- [ ] **Step 5:** Commit `ios: Face ID lock and the Me tab`.

### Task 8: The engraved dial

**Files:**
- Create: `Sources/SpendozaKit/Score/DialGeometry.swift`, `Tests/SpendozaKitTests/DialGeometryTests.swift`, `Spendoza/Features/Health/EngravedDial.swift`

**Interfaces:**
- Produces: `enum DialGeometry { static func angle(forScore: Int) -> Double /* degrees: 0 → 180, 50 → 90, 100 → 0 */; static let bandStops: [(ScoreBand, ClosedRange<Int>)] }`; `func dialAccessibilityLabel(score: Int, previous: Int?, month: Month) -> String`; `struct EngravedDial: View { init(score: Int, previousScore: Int?, size: DialSize /* .large, .widget */) }`.

- [ ] **Step 1: Write failing tests:** angles for 0, 50, 64 (64.8), 100; scores clamp to 0…100; labels: `(64, 73, Oct)` → `"Health score 64 of 100, Fair, down 9 since September."`, `(70, 70, Oct)` → `"... Good, same as September."`, `(64, nil, Oct)` → `"Health score 64 of 100, Fair."`.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement the geometry, then the view per spec and `drilldown.png`: three band arcs, guilloché (rotated ellipses, `note` ~50% opacity, clipped above the hub), ink needle at the score, dashed needle at `previousScore` (absent when nil), serif score at the hub with "of 100"; `.large` includes the engraving, `.widget` omits it; `accessibilityElement(children: .ignore)` with the label. **Step 4:** Run; expect pass; check the SwiftUI preview against the mockup.
- [ ] **Step 5:** Commit `ios: the engraved health dial`.

### Task 9: Onboarding and the Health tab

**Files:**
- Create: `Spendoza/Features/Onboarding/{OnboardingModel,OnboardingView}.swift`, `Spendoza/Features/Health/{HealthModel,HealthView,PartRow}.swift`, `Sources/SpendozaKit/Cache/ReportCache.swift`, `SpendozaTests/{OnboardingModelTests,HealthModelTests}.swift`, `SpendozaTests/Support/StubAPI.swift`

**Interfaces:**
- Consumes: `SpendozaAPI` (Task 5), `checkupMonth/soFarMonth` (Task 4), `partChanges`, `suggestions` (Task 3), `SnapshotStore` (Task 4), `EngravedDial` (Task 8).
- Produces:
  - `@MainActor @Observable final class OnboardingModel { enum Step { case welcome, upload, processing, review, complete }; var step: Step; func upload(fileURL: URL) async; func skipUpload(); func pollUntilProcessed() async; func finish(emailReports: Bool) async throws }` — `finish` sends `ProfileChange(emailReportsEnabled:, timezone: TimeZone.current.identifier)` then `completeOnboarding()`.
  - `@MainActor @Observable final class HealthModel { enum State { case loading, empty, loaded(HealthSnapshot), failed(String) }; var state: State; var selectedMonth: Month?; var availableMonths: [Month]; func load(now: Date) async; func select(_ month: Month) async }`; `struct HealthSnapshot { let report: Report; let previous: Report?; let parts: [PartChange]; let suggestion: Suggestion?; let soFar: Report?; let isCached: Bool; let updatedAt: Date }`.
  - `final class ReportCache { func store(_ r: Report); func load(month: Month) -> Report? }` (Caches directory, JSON).

- [ ] **Step 1: Write failing tests:**
  - Onboarding: upload → processing; poll sees `parsed` → review; `failed` → shows the server's `errorMessage` with Retry/Remove options; skip → complete; `finish(emailReports: true)` calls `updateProfile` with the device time zone, then `completeOnboarding`, in that order.
  - Health: with reports for Sep, Oct and Nov on 2026-11-14 → loads Oct as the check-up with Sep as previous and Nov as `soFar`; parts in spec order with wants `delta == -6`; the widget snapshot saved is `(64, .fair, 73, Oct)`; no reports at all → `.empty`; `personalReport` throws `.offline` after a cached Oct exists → `.loaded` with `isCached == true`; nothing cached and offline → `.failed("You're offline. Your last check-up will show here once it has loaded once.")`; `select(Sep)` loads Sep with Aug as previous.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement the models, then views matching `drilldown.png` (Health): title "Your money's health", month menu under it ("October check-up"), dial, band line ("Fair, down 9 since September"), ruled part rows (points/max, delta in oxblood when negative, nothing when nil), the "November so far" row (partial score, no delta, opens a read-only drill-down), one `SuggestionPanel`, "Last updated …" when cached, empty state with "Add your first statement" (opens the onboarding upload step). Routing: `.onboarding` phase shows `OnboardingView`; first launch after completing onboarding requests notification permission (Task 11).
- [ ] **Step 4:** Run; expect pass; run against test with a real account.
- [ ] **Step 5:** Commit `ios: onboarding and the Health tab`.

### Task 10: Part and category drill-down

**Files:**
- Create: `Spendoza/Features/Health/{PartDetailModel,PartDetailView,CategoryDetailModel,CategoryDetailView,BudgetSheet,PlanNotAvailableView}.swift`, `SpendozaTests/{PartDetailModelTests,CategoryDetailModelTests}.swift`

**Interfaces:**
- Consumes: `HealthSnapshot` (Task 9), `categoryChanges`, `ScorePart.rule` (Task 3), `SpendozaAPI.transactions/setCategory/createBudgetGoal/personalReport` (Task 5).
- Produces: `PartDetailModel(part: ScorePart, snapshot: HealthSnapshot, api: SpendozaAPI)` with `trend: [Month: Int]` (points for the five months ending at the check-up month; missing months absent), `movers: [CategoryChange]`, `primaryAction: SuggestionAction?`; `CategoryDetailModel(category: Category, month: Month, api: SpendozaAPI)` with `total`, `delta`, `typicalMonthly: Double?` (average of the prior months that have reports), `trend`, `transactions: [Transaction]` (that month, `category == name`), `func recategorize(_ t: Transaction, to: String) async`, `func setBudget(amount: Int) async -> BudgetResult` where `enum BudgetResult { case saved, notOnPlan, failed(String) }`.

- [ ] **Step 1: Write failing tests:** Wants part → movers start with Dining out (+310) and exclude needs categories; trend fetches the four prior months' reports (stub) and omits a missing month; Savings rate, Emergency fund and Debt parts have no category list (they map to income/goals/debts screens in later plans) — Savings rate shows income vs expenses for the month; Emergency fund's primary action is `.openEmergencyFund`; Debt's primary action is `nil` until Plan 4. Category: transactions are only that category's, in date order; `typicalMonthly` averages Jun–Sep; recategorizing removes the row and calls `setCategory`; `setBudget` → `.saved`; a stubbed `.notOnPlan` → `.notOnPlan` and the view shows `PlanNotAvailableView` ("Not available on your plan yet" + Plans & billing link).
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement models and views per `drilldown.png` (part: big serif figure, "−6 since Sep", rule sentence, meter with the threshold line, engraved five-month bars with the current month amber, "What moved it" rows; category: amount and change, "You usually spend about $X a month here", trend, ruled transaction rows → category picker sheet, "Set a $X budget" → `BudgetSheet` with the suggested amount editable). **Step 4:** Run; expect pass.
- [ ] **Step 5:** Commit `ios: drill down from a score part to its categories and transactions`.

### Task 11: Widgets and the check-up notification

**Files:**
- Create: `apps/ios/SpendozaWidgets/{SpendozaWidgets.swift,HealthWidget.swift,Info.plist,SpendozaWidgets.entitlements}`, `Spendoza/App/CheckupRefresh.swift`, `SpendozaTests/CheckupRefreshTests.swift`
- Modify: `apps/ios/project.yml` (widget extension target embedded in the app, App Group on both, `BGTaskSchedulerPermittedIdentifiers: [com.gravitaz.spendoza.checkup]`, `UIBackgroundModes: [fetch]`)

**Interfaces:**
- Consumes: `SnapshotStore`, `WidgetSnapshot`, `checkupMonth`, `checkupNotice` (Task 4), `EngravedDial(size: .widget)` (Task 8 — the widget target compiles the dial file too).
- Produces: `HealthWidget` supporting `.systemSmall` (dial with score at the hub and "Fair · down 9") and `.accessoryCircular` (ring + score); empty snapshot → "Open Spendoza to see your score". `final class CheckupRefresh { func register(); func schedule(); func run(api: SpendozaAPI, now: Date) async -> String? /* posted notification body, for tests */ }` — stores the last notified month in `UserDefaults` key `lastNotifiedCheckup`; after saving a new snapshot calls `WidgetCenter.shared.reloadAllTimelines()`.

- [ ] **Step 1: Write failing tests:** `run` on 2026-11-02 finds a new Oct report, last notified Sep → returns `"Your October check-up is ready"`, stores Oct, saves the Oct snapshot; a second run returns nil; signed out → nil and no request.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement; schedule the refresh after each foreground and on launch (earliest begin date: next day 10:00 local, so it runs after the 09:00 UTC job). **Step 4:** Run; expect pass; add both widgets on the simulator and confirm no amounts appear.
- [ ] **Step 5:** Commit `ios: health widgets and the monthly check-up notification`.

### Task 12: Accessibility and screen check

**Files:**
- Create: `apps/ios/SpendozaUITests/{AccessibilityAuditUITests,HealthFlowUITests}.swift`, `apps/ios/SpendozaUITests/Support/LaunchArguments.swift`
- Modify: `Spendoza/App/SpendozaApp.swift` (`-uiTestStubAPI` launch argument swaps in the stub API with the Oct/Sep fixtures), `SpendozaTests/Support/StubAPI.swift` (move to a file both test targets compile; add an October transactions fixture that includes `Steakhouse` −$18.20 in Dining out)

- [ ] **Step 1: Write UI tests:** `HealthFlowUITests` — launch stubbed, Health shows "64", tap "Wants", see "What moved it" and "Dining out", tap it, see a row labeled "Steakhouse" with "$18.20"; `AccessibilityAuditUITests` — `try app.performAccessibilityAudit()` on Health, Wants and Dining out, in light and dark, at the largest accessibility text size.
- [ ] **Step 2:** Run; fix every finding (labels, contrast, clipping at large text).
- [ ] **Step 3:** Run `scripts/test.sh`; all pass.
- [ ] **Step 4:** Commit `ios: accessibility audit and the Health flow UI test`.

### Task 13: TestFlight

**Files:**
- Create: `apps/ios/fastlane/{Fastfile,Appfile}`, `apps/ios/Gemfile`, `.github/workflows/ios-testflight.yml`, `docs/ios-ci-cd.md`
- Modify: `README.md` (link `docs/ios-ci-cd.md`)

**Interfaces:**
- Produces: fastlane `beta` lane modeled on CharadeFam's (`setup_ci`, App Store Connect API key, stored distribution certificate, **two** App Store provisioning profiles — app and widgets — applied per target with `update_code_signing_settings`, `build_app` Release, `upload_to_testflight` with `skip_waiting_for_build_processing: true`); workflow on `workflow_dispatch` only, `BUILD_NUMBER: ${{ github.run_number }}`.
- Secrets (names only): `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `IOS_DIST_CERT_P12`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROVISIONING_PROFILE_APP`, `IOS_PROVISIONING_PROFILE_WIDGETS`.

- [ ] **Step 1: Owner actions (list them in `docs/ios-ci-cd.md` and ask the owner):** create the App IDs `com.gravitaz.spendoza` and `com.gravitaz.spendoza.widgets` with the App Group capability, the App Group `group.com.gravitaz.spendoza`, two App Store provisioning profiles, the "Spendoza" app record in App Store Connect under Gravitaz LLC, and add the secrets above to the Spendoza repo; add the TestFlight internal testers (owner and household).
- [ ] **Step 2:** Add the lane, Gemfile and workflow; run `bundle exec fastlane beta` locally with the env set, or dispatch the workflow; expected: "Successfully uploaded to TestFlight".
- [ ] **Step 3:** Install from TestFlight on a device: sign in, finish onboarding or see Health, drill down, add the widget, lock/unlock with Face ID.
- [ ] **Step 4:** Commit `ios: TestFlight lane and workflow`.
