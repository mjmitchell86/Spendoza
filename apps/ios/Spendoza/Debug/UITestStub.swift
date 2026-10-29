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
        api.profileResult = Profile(id: "ui-test-user", displayName: "Test", onboardingCompleted: true,
                                    isAdmin: false, emailReportsEnabled: false, householdID: nil)
        return api
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
