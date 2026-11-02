#if DEBUG
import BackgroundTasks
import Foundation
import SpendozaKit

/// The `-uiTestStubAPI` launch argument (R37). Debug builds only: none of this, nor the argument check in
/// `SpendozaApp`, is compiled into Release or TestFlight builds, since an argument that swaps the API and
/// passes the lock would be an auth bypass.
enum UITestStub {
    static let argument = "-uiTestStubAPI"
    static var isOn: Bool { CommandLine.arguments.contains(argument) }

    /// `-uiTestColorScheme dark|light`: sets the app's own Appearance preference at launch, so the root's
    /// `.preferredColorScheme` applies it whatever the simulator's setting (the device API differs by Xcode).
    static func applyColorScheme(to defaults: UserDefaults = .standard) {
        guard isOn, let index = CommandLine.arguments.firstIndex(of: "-uiTestColorScheme"),
              CommandLine.arguments.indices.contains(index + 1),
              let scheme = Appearance(rawValue: CommandLine.arguments[index + 1]) else { return }
        scheme.store(in: defaults)
    }

    /// A day in November 2026, so October is the check-up month whatever the simulator's clock says.
    static let now = Date(timeIntervalSince1970: 1_794_000_000)

    /// The October check-up of the drill-down mockup, with its Dining out transactions.
    static func api() -> StubAPI {
        let api = DrillFixture.api()
        let months = [DrillFixture.jun, DrillFixture.jul, DrillFixture.aug, DrillFixture.sep, DrillFixture.oct]
        api.reports = Dictionary(uniqueKeysWithValues: months.map { ($0, DrillFixture.report($0)) })
        api.transactionList = [
            tx("t1", "2026-10-18", "Steakhouse 1820", 212.40),
            tx("t2", "2026-10-23", "Olive Garden", 86.09),
            tx("t3", "2026-10-02", "Dominos Pizza", 25.30),
            tx("t4", "2026-10-01", "Panera Bread", 26.27),
        ]
        // `-uiTestSlowSelect`: months before June answer slowly, so picking an older check-up takes a while.
        if CommandLine.arguments.contains("-uiTestSlowSelect") {
            api.reportDelay = { $0 < DrillFixture.jun ? .seconds(3) : nil }
        }
        // `-uiTestBudgetNotOnPlan`: saving a budget answers 403 for the plan.
        if CommandLine.arguments.contains("-uiTestBudgetNotOnPlan") {
            api.budgetError = .notOnPlan(requiredTier: "starter")
        }
        // `-uiTestProfileUpdateOffline`: saving the profile fails as if offline.
        // (The profile then starts with weekly reports on, so the failing change is turning them off.)
        let updateOffline = CommandLine.arguments.contains("-uiTestProfileUpdateOffline")
        if updateOffline { api.updateProfileError = .offline }
        // The photo URL points at nothing that answers, so the avatar falls back to initials without the network.
        api.profileResult = Profile(id: "ui-test-user", displayName: "Test", onboardingCompleted: true,
                                    isAdmin: CommandLine.arguments.contains("-uiTestAdmin"), emailReportsEnabled: updateOffline, householdID: nil,
                                    avatarURL: URL(string: "http://127.0.0.1:9/avatar.jpg"), subscriptionTier: "pro",
                                    createdAt: Date(timeIntervalSince1970: 1_780_000_000))
        configureMoney(api)
        if let mode = householdMode { configureHousehold(api, mode) }
        // Two of the three invite codes: one available, one used.
        api.inviteCodeList = [
            InviteCode(id: "i1", code: "SPEND-7K2Q", createdAt: Date(timeIntervalSince1970: 1_790_000_000)),
            InviteCode(id: "i2", code: "SPEND-M4XD", usedAt: Date(timeIntervalSince1970: 1_791_000_000),
                       createdAt: Date(timeIntervalSince1970: 1_785_000_000), usedBy: "u9"),
        ]
        // `-uiTestAdmin`: an admin account, with a year of platform trends for the dashboard.
        if CommandLine.arguments.contains("-uiTestAdmin") {
            api.adminTrendsResult = .success(adminTrends())
            let pages = adminUsers()
            api.adminUsersPages = Dictionary(uniqueKeysWithValues: pages.map { ($0.page, $0) })
        }
        return api
    }

    /// What the Money tab's Overview shows: bills due around the stub's "today" (one already past, which it leaves
    /// out) and October's two statements.
    private static func configureMoney(_ api: StubAPI) {
        func due(_ day: Int) -> Date {
            Calendar.current.date(from: DateComponents(year: 2026, month: 11, day: day))!
        }
        func bill(_ id: String, _ name: String, _ amount: Double, day: Int, auto: Bool = false, category: String = "c4") -> Expense {
            Expense(id: id, categoryID: category, description: name, amount: amount, frequency: .recurring, interval: .monthly,
                    nextDueDate: due(day), autoDetected: auto)
        }
        api.expenseList = [
            bill("e0", "Gym", 29, day: 3),
            bill("e1", "Netflix", 15.49, day: 6, auto: true),
            bill("e2", "Rent", 1800, day: 8, category: "c1"),
            bill("e3", "Phone", 62.5, day: 15, category: "c5"),
            bill("e4", "Car insurance", 148.2, day: 21, auto: true, category: "c1"),
        ]
        // What Overview's Upcoming bills lists stays these five; the Bills tab also shows the rest.
        api.upcomingBillList = api.expenseList
        // An AI-adjusted annual bill (its original amount struck through) and a one-time one.
        api.expenseList += [
            Expense(id: "e5", categoryID: "c5", description: "AMZN PRIME MEMBERSHIP", friendlyName: "Prime", amount: 139,
                    frequency: .recurring, interval: .annually,
                    nextDueDate: Calendar.current.date(from: DateComponents(year: 2027, month: 3, day: 14))!,
                    autoDetected: true, isAIAdjusted: true, originalAmount: 119),
            Expense(id: "e6", categoryID: "c1", description: "Car registration", amount: 212, frequency: .oneTime,
                    nextDueDate: due(26)),
        ]
        // Bills ▸ Income: one of yours (auto-detected), one Ann (a household member) owns and attributed to you, one with a
        // custom name, and an AI-suggested one-time entry.
        func income(_ id: String, _ source: String, friendly: String? = nil, _ amount: Double, _ frequency: IncomeFrequency,
                    _ month: Int, owner: String = "ui-test-user", attributedUser: String? = nil, attributedName: String? = nil,
                    auto: Bool = false, ai: Bool = false) -> IncomeEntry {
            IncomeEntry(id: id, ownerID: owner, sourceName: source, friendlyName: friendly, amount: amount, frequency: frequency,
                        effectiveDate: Calendar.current.date(from: DateComponents(year: 2026, month: month, day: 1))!,
                        attributedToUserID: attributedUser, attributedToName: attributedName, autoDetected: auto, aiSuggested: ai)
        }
        api.incomeList = [
            income("in1", "ACME CORP PAYROLL", friendly: "Salary", 4200.5, .monthly, 10, auto: true),
            income("in2", "Freelance design", 650, .monthly, 8, owner: "u-ann", attributedUser: "ui-test-user"),
            income("in3", "Rental income", 900, .monthly, 6, attributedName: "Jane (partner)"),
            income("in4", "Tax refund", 1200, .oneTime, 3, ai: true),
        ]
        // October's other transactions: pay and groceries, a refund, and one nothing has categorized yet.
        func tx(_ id: String, _ date: String, _ name: String, _ amount: Double, _ category: String?,
                type: TransactionType = .debit) -> Transaction {
            Transaction(id: id, date: date, description: name, amount: amount, type: type, category: category)
        }
        api.transactionList += [
            tx("m1", "2026-10-31", "Acme Corp payroll", 2500, nil, type: .credit),
            tx("m2", "2026-10-23", "Whole Foods", 142.88, "Groceries"),
            tx("m3", "2026-10-18", "Landlord rent", 1800, "Housing"),
            tx("m4", "2026-10-15", "Amazon refund", 34.99, "Personal", type: .credit),
            tx("m5", "2026-10-09", "Venmo J. Alvarez", 45, nil),
            tx("m6", "2026-10-01", "Netflix", 15.49, "Entertainment"),
        ]
        let uploaded = Date(timeIntervalSince1970: 1_792_000_000)
        api.statementScript = [[
            Statement(id: "s1", status: .parsed, fileType: "pdf", bankName: "Chase", accountLabel: "Checking", createdAt: uploaded,
                      statementMonth: DrillFixture.oct),
            Statement(id: "s2", status: .parsed, fileType: "csv", bankName: "Amex", createdAt: uploaded, statementMonth: DrillFixture.oct),
        ]]
    }

    /// `-uiTestHousehold head|member|none|invited`: the signed-in user heads a household of three (with an
    /// invitation waiting), is a member of one, is in none, or is in none with an invitation of their own. The household actions change what the stub answers next.
    static var householdMode: String? {
        let arguments = CommandLine.arguments
        guard isOn, let index = arguments.firstIndex(of: "-uiTestHousehold"), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    private static func configureHousehold(_ api: StubAPI, _ mode: String) {
        api.simulatesHousehold = true
        let me = "ui-test-user"
        let sent = Date(timeIntervalSince1970: 1_793_000_000)
        switch mode {
        case "head":
            api.householdResult = .success(Household(id: "h1", name: "The Smiths", headID: me, inviteCode: "abcdefghjk", members: [
                Member(id: me, displayName: "Test", incomeSharing: .partial, expenseSharing: .category),
                Member(id: "u-ann", displayName: "Ann Smith"),
                Member(id: "u-bob", displayName: "Bob Smith", incomeSharing: .none, expenseSharing: .none),
            ]))
            api.pendingInvitationsResult = .success([
                PendingInvitation(id: "p1", email: "cara@example.com", createdAt: sent, expiresAt: sent.addingTimeInterval(7 * 86_400)),
                PendingInvitation(id: "p2", email: "dan@example.com", createdAt: sent, expiresAt: sent.addingTimeInterval(7 * 86_400)),
            ])
            api.categoryList = [
                BudgetCategory(id: "c1", name: "Housing", budgetClass: .need, isSharedWithHousehold: true),
                BudgetCategory(id: "c2", name: "Groceries", budgetClass: .need, isSharedWithHousehold: true),
                BudgetCategory(id: "c3", name: "Dining out", budgetClass: .want),
                BudgetCategory(id: "c4", name: "Streaming", budgetClass: .want),
            ]
        case "member":
            api.householdResult = .success(Household(id: "h1", name: "The Smiths", headID: "u-ann", members: [
                Member(id: me, displayName: "Test"),
                Member(id: "u-ann", displayName: "Ann Smith", incomeSharing: .partial, expenseSharing: .category),
            ]))
        case "invited":
            api.householdResult = .success(nil)
            api.myInvitationsResult = .success([
                MyInvitation(id: "inv1", householdName: "The Smiths", inviterName: "Ann Smith",
                             expiresAt: sent.addingTimeInterval(7 * 86_400)),
            ])
        default:
            api.householdResult = .success(nil)
        }
        let sharesByCategory = mode == "head"
        let current = api.profileResult
        api.profileResult = current.map {
            Profile(id: $0.id, displayName: $0.displayName, onboardingCompleted: true, isAdmin: $0.isAdmin,
                    emailReportsEnabled: $0.emailReportsEnabled, householdID: mode == "none" || mode == "invited" ? nil : "h1", avatarURL: $0.avatarURL,
                    subscriptionTier: $0.subscriptionTier, createdAt: $0.createdAt,
                    incomeSharing: sharesByCategory ? .partial : .all, expenseSharing: sharesByCategory ? .category : .all,
                    sharedIncomeAmount: sharesByCategory ? 500 : nil)
        }
    }

    /// Two pages of users (30 in all): the signed-in admin, a disabled one, one with no email and a long name,
    /// then plain ones, so the list has to load more.
    private static func adminUsers() -> [AdminUserPage] {
        func user(_ id: String, _ name: String, _ email: String?, tier: String, admin: Bool = false, disabled: Bool = false) -> AdminUser {
            AdminUser(id: id, displayName: name, email: email, tier: tier, isAdmin: admin, disabled: disabled,
                      createdAt: Date(timeIntervalSince1970: 1_780_000_000))
        }
        let special = [
            user("ui-test-user", "Test", "test@example.com", tier: "pro", admin: true),
            user("u2", "Ann Baker", "ann.baker@example.com", tier: "starter"),
            user("u3", "Carlos Ibarra-Villanueva-Montgomery", "carlos.ibarra.villanueva@example.com", tier: "free", disabled: true),
            user("u4", "Dee", nil, tier: "free"),
        ]
        let plain = (5...30).map { user("u\($0)", "User \($0)", "user\($0)@example.com", tier: "free") }
        let all = special + plain
        return [AdminUserPage(users: Array(all[0..<25]), total: 30, page: 1, limit: 25),
                AdminUserPage(users: Array(all[25...]), total: 30, page: 2, limit: 25)]
    }

    private static func adminTrends() -> AdminTrends {
        var months: [String] = []
        var signups: [AdminTrends.UserTrend] = []
        var activity: [AdminTrends.ActivityTrend] = []
        for i in 0..<12 {
            let index = i + 9
            let month = String(format: "%04d-%02d-01", 2025 + index / 12, index % 12 + 1)
            months.append(month)
            signups.append(.init(month: month, newUsers: 2 + (i * 5) % 9))
            activity.append(.init(month: month, metric: "transactions", count: 800 + i * 150))
            activity.append(.init(month: month, metric: "reports", count: 20 + i * 3))
            activity.append(.init(month: month, metric: "emails", count: 40 + i * 9))
        }
        let last = months[11]
        let categorize = AdminTrends.LLMStat(month: last, callType: "categorize", callCount: 412, totalTokens: 1_240_500,
                                             avgTokens: 3_011, minTokens: 820, maxTokens: 9_800, totalCost: 0.0123)
        let insights = AdminTrends.LLMStat(month: last, callType: "insights", callCount: 38, totalTokens: 96_200,
                                           avgTokens: 2_531, minTokens: 1_100, maxTokens: 4_900, totalCost: nil)
        return AdminTrends(userTrends: signups, activityTrends: activity, llmStats: [categorize, insights])
    }

    private static func tx(_ id: String, _ date: String, _ description: String, _ amount: Double) -> Transaction {
        Transaction(id: id, date: date, description: description, amount: amount, type: .debit, category: "Dining out")
    }

    /// Signed in, onboarded, with this stub as its API.
    @MainActor static func store() -> SessionStore {
        let store = SessionStore(api: api(), userID: "ui-test-user", accountScope: AppServices.accountScope)
        Task { await store.refresh() }
        return store
    }

    /// The lock passes without Face ID.
    struct PassingAuthenticator: Authenticator {
        func authenticate(reason: String) async -> Bool { true }
    }

    /// Face ID that always fails, so the app stays locked.
    struct FailingAuthenticator: Authenticator {
        func authenticate(reason: String) async -> Bool { false }
    }

    /// Fails every other time, starting with a pass: the launch unlocks, the next automatic prompt (after a trip to
    /// the background) fails so the lock can be inspected, and the Unlock button then passes.
    final class AlternatingAuthenticator: Authenticator, @unchecked Sendable {
        private let lock = NSLock()
        private var attempts = 0
        func authenticate(reason: String) async -> Bool {
            lock.withLock {
                attempts += 1
                return attempts % 2 == 1
            }
        }
    }

    /// Off unless `-uiTestLockEnabled`; with `-uiTestLockFails` it never unlocks, with `-uiTestLockAlternates`
    /// Face ID alternates pass and fail.
    @MainActor static func lock() -> AppLock {
        let arguments = CommandLine.arguments
        let authenticator: Authenticator
        if arguments.contains("-uiTestLockFails") {
            authenticator = FailingAuthenticator()
        } else if arguments.contains("-uiTestLockAlternates") {
            authenticator = AlternatingAuthenticator()
        } else {
            authenticator = PassingAuthenticator()
        }
        return AppLock(authenticator: authenticator, isEnabled: arguments.contains("-uiTestLockEnabled"))
    }

    /// No permission prompt, notification, background task or widget reload.
    struct QuietNotifier: CheckupNotifying {
        func canPost() async -> Bool { false }
        func post(body: String) async {}
        func requestAuthorization() async {}
    }

    struct QuietScheduler: CheckupScheduling {
        func register(identifier: String, handler: @escaping @Sendable (BGAppRefreshTask) -> Void) {}
        func submit(_ request: BGAppRefreshTaskRequest) throws {}
    }

    struct QuietWidgets: WidgetReloading {
        func reloadAll() {}
    }

    @MainActor static func checkup(store: SessionStore) -> CheckupRefresh {
        CheckupRefresh(scope: AppServices.accountScope, snapshots: AppServices.snapshots,
                       hasSession: { false }, hasStoredSession: { false }, makeAPI: { await store.api },
                       notifier: QuietNotifier(), scheduler: QuietScheduler(), widgets: QuietWidgets())
    }
}
#endif
