import BackgroundTasks
import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

private final class FakeNotifier: CheckupNotifying, @unchecked Sendable {
    private let lock = NSLock()
    private var _posted: [String] = []
    private var _authorizationRequests = 0
    var allowed = true
    var posted: [String] { lock.withLock { _posted } }
    var authorizationRequests: Int { lock.withLock { _authorizationRequests } }

    func canPost() async -> Bool { allowed }
    func post(body: String) async { lock.withLock { _posted.append(body) } }
    func requestAuthorization() async { lock.withLock { _authorizationRequests += 1 } }
}

private final class FakeWidgets: WidgetReloading, @unchecked Sendable {
    private let lock = NSLock()
    private var _reloads = 0
    var reloads: Int { lock.withLock { _reloads } }
    func reloadAll() { lock.withLock { _reloads += 1 } }
}

private final class FakeScheduler: CheckupScheduling, @unchecked Sendable {
    private let lock = NSLock()
    private var _registered: [String] = []
    private var _submitted: [BGAppRefreshTaskRequest] = []
    var registered: [String] { lock.withLock { _registered } }
    var submitted: [BGAppRefreshTaskRequest] { lock.withLock { _submitted } }

    func register(identifier: String, handler: @escaping @Sendable (BGAppRefreshTask) -> Void) {
        lock.withLock { _registered.append(identifier) }
    }
    func submit(_ request: BGAppRefreshTaskRequest) throws { lock.withLock { _submitted.append(request) } }
}

@MainActor
struct CheckupRefreshTests {
    private static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()
    private static func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        utc.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    private let sep = StubAPI.sep, oct = StubAPI.oct

    private struct Harness {
        let refresh: CheckupRefresh
        let notifier: FakeNotifier
        let widgets: FakeWidgets
        let scheduler: FakeScheduler
        let snapshots: SnapshotStore
        let defaults: UserDefaults
        let scope: AccountScope
        let suite: String
    }

    private func harness(_ api: StubAPI, signedIn: Bool = true, scope: AccountScope? = nil) -> Harness {
        let suite = "test.spendoza.checkup.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let scope = scope ?? AccountScope(userID: signedIn ? "user-a" : nil)
        let snapshots = SnapshotStore(appGroup: suite)
        let notifier = FakeNotifier(), widgets = FakeWidgets(), scheduler = FakeScheduler()
        let refresh = CheckupRefresh(
            scope: scope, snapshots: snapshots, defaults: defaults, calendar: Self.utc,
            hasSession: { signedIn }, makeAPI: { api },
            notifier: notifier, scheduler: scheduler, widgets: widgets)
        return Harness(refresh: refresh, notifier: notifier, widgets: widgets, scheduler: scheduler,
                       snapshots: snapshots, defaults: defaults, scope: scope, suite: suite)
    }

    private func api() -> StubAPI {
        let api = StubAPI()
        api.reports = [
            sep: StubAPI.report(sep, score: 73, previous: 70, points: [23, 20, 15, 10, 5]),
            oct: StubAPI.report(oct, score: 64, previous: 73, points: [20, 20, 9, 10, 5]),
        ]
        return api
    }

    @Test func newCheckupPostsTheNoticeStoresTheMonthAndSavesTheSnapshot() async {
        let stub = api()
        let h = harness(stub)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }
        h.defaults.set(sep.apiString, forKey: CheckupRefresh.lastNotifiedKey)

        let body = await h.refresh.run(api: stub, now: Self.date(2026, 11, 2))

        #expect(body == "Your October check-up is ready")
        #expect(h.notifier.posted == ["Your October check-up is ready"])
        #expect(h.defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == oct.apiString)
        #expect(h.snapshots.load() == WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: oct))
        #expect(h.widgets.reloads == 1)
    }

    @Test func aSecondRunPostsNothing() async {
        let stub = api()
        let h = harness(stub)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        let first = await h.refresh.run(api: stub, now: Self.date(2026, 11, 2))
        let second = await h.refresh.run(api: stub, now: Self.date(2026, 11, 3))

        #expect(first == "Your October check-up is ready")
        #expect(second == nil)
        #expect(h.notifier.posted.count == 1)
        #expect(h.widgets.reloads == 1, "an unchanged snapshot does not reload the widget again")
    }

    @Test func signedOutDoesNothingAndAsksNothing() async {
        let stub = api()
        let h = harness(stub, signedIn: false)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        let body = await h.refresh.run(api: stub, now: Self.date(2026, 11, 2))

        #expect(body == nil)
        #expect(stub.requestedMonths.isEmpty)
        #expect(h.notifier.posted.isEmpty)
        #expect(h.snapshots.load() == nil)
        #expect(h.defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == nil)
    }

    @Test func noReportYetDoesNothing() async {
        let stub = StubAPI()
        let h = harness(stub)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        #expect(await h.refresh.run(api: stub, now: Self.date(2026, 11, 2)) == nil)
        #expect(h.snapshots.load() == nil)
        #expect(h.widgets.reloads == 0)
    }

    @Test func aFailingRequestIsSilent() async {
        let stub = api()
        stub.reportError = .offline
        let h = harness(stub)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        #expect(await h.refresh.run(api: stub, now: Self.date(2026, 11, 2)) == nil)
        #expect(h.defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == nil)
    }

    @Test func theInProgressMonthIsNotACheckup() async {
        let stub = StubAPI()
        stub.reports = [oct: StubAPI.report(oct, score: 64, previous: 73, points: [20, 20, 9, 10, 5])]
        let h = harness(stub)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        #expect(await h.refresh.run(api: stub, now: Self.date(2026, 10, 20)) == nil)
        #expect(h.snapshots.load() == nil)
    }

    @Test func signOutDuringTheFetchDropsEverything() async {
        let stub = api()
        stub.reportDelay = { _ in .milliseconds(50) }
        let scope = AccountScope(userID: "user-a")
        let h = harness(stub, scope: scope)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        let refresh = h.refresh, now = Self.date(2026, 11, 2)
        let task = Task { await refresh.run(api: stub, now: now) }
        try? await Task.sleep(for: .milliseconds(10))
        scope.end()

        #expect(await task.value == nil)
        #expect(h.notifier.posted.isEmpty)
        #expect(h.snapshots.load() == nil)
        #expect(h.defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == nil)
    }

    @Test func deniedPermissionRecordsTheMonthWithoutPosting() async {
        let stub = api()
        let h = harness(stub)
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }
        h.notifier.allowed = false

        #expect(await h.refresh.run(api: stub, now: Self.date(2026, 11, 2)) == nil)
        #expect(h.notifier.posted.isEmpty)
        #expect(h.defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == oct.apiString)
        #expect(h.snapshots.load()?.month == oct, "the widget still updates")
    }

    @Test func scheduleAsksForTomorrowAtTenLocal() throws {
        let h = harness(StubAPI())
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        h.refresh.schedule(now: Self.date(2026, 11, 2, 15))

        let request = try #require(h.scheduler.submitted.first)
        #expect(request.identifier == "com.gravitaz.spendoza.checkup")
        #expect(request.earliestBeginDate == Self.date(2026, 11, 3, 10))
    }

    @Test func registerRegistersTheCheckupIdentifier() {
        let h = harness(StubAPI())
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }
        h.refresh.register()
        #expect(h.scheduler.registered == ["com.gravitaz.spendoza.checkup"])
    }

    @Test func permissionIsRequestedOnlyOnce() async {
        let h = harness(StubAPI())
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }

        await h.refresh.requestPermissionIfNeeded()
        await h.refresh.requestPermissionIfNeeded()

        #expect(h.notifier.authorizationRequests == 1)
    }

    @Test func clearStateForgetsTheLastNotifiedMonth() {
        let h = harness(StubAPI())
        defer { UserDefaults().removePersistentDomain(forName: h.suite) }
        h.defaults.set(oct.apiString, forKey: CheckupRefresh.lastNotifiedKey)
        h.refresh.clearAccountState()
        #expect(h.defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == nil)
    }
}
