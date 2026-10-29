import BackgroundTasks
import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

private final class CountingWidgets: WidgetReloading, @unchecked Sendable {
    private let lock = NSLock()
    private var _reloads = 0
    var reloads: Int { lock.withLock { _reloads } }
    func reloadAll() { lock.withLock { _reloads += 1 } }
}

private final class QuietNotifier: CheckupNotifying, @unchecked Sendable {
    private let lock = NSLock()
    private var _posted: [String] = []
    var posted: [String] { lock.withLock { _posted } }
    func canPost() async -> Bool { true }
    func post(body: String) async { lock.withLock { _posted.append(body) } }
    func requestAuthorization() async {}
}

private final class NoScheduler: CheckupScheduling, @unchecked Sendable {
    func register(identifier: String, handler: @escaping @Sendable (BGAppRefreshTask) -> Void) {}
    func submit(_ request: BGAppRefreshTaskRequest) throws {}
}

@MainActor
struct WidgetSyncTests {
    private static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()
    private static func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        utc.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
    }
    private let sep = StubAPI.sep, oct = StubAPI.oct, nov = StubAPI.nov
    private let snapshot = WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: StubAPI.oct)

    private struct Parts {
        let sync: WidgetSync
        let widgets = CountingWidgets()
        let snapshots: SnapshotStore
        let defaults: UserDefaults
        let suite: String
    }

    private func parts() -> (WidgetSync, CountingWidgets, SnapshotStore, UserDefaults, String) {
        let suite = "test.spendoza.sync.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let snapshots = SnapshotStore(appGroup: suite)
        let widgets = CountingWidgets()
        return (WidgetSync(snapshots: snapshots, widgets: widgets, defaults: defaults), widgets, snapshots, defaults, suite)
    }

    @Test func changedSnapshotSavesAndReloadsOnce_identicalDoesNot() {
        let (sync, widgets, snapshots, _, suite) = parts()
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let scope = AccountScope(userID: "user-a")
        let token = scope.token()

        sync.save(snapshot, token: token, scope: scope)
        #expect(snapshots.load() == snapshot)
        #expect(widgets.reloads == 1)

        sync.save(snapshot, token: token, scope: scope)
        #expect(widgets.reloads == 1)
    }

    @Test func staleTokenSavesAndReloadsNothing() {
        let (sync, widgets, snapshots, _, suite) = parts()
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let scope = AccountScope(userID: "user-a")
        let token = scope.token()
        scope.end()

        sync.save(snapshot, token: token, scope: scope)
        #expect(snapshots.load() == nil)
        #expect(widgets.reloads == 0)
    }

    /// Health loads October in the app; the background run then has nothing new to announce,
    /// until November's report appears.
    @Test func seeingACheckupInTheAppCountsAsNotified() async throws {
        let (sync, widgets, snapshots, defaults, suite) = parts()
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let scope = AccountScope(userID: "user-a")
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let stub = StubAPI()
        stub.reports = [
            sep: StubAPI.report(sep, score: 73, previous: 70, points: [23, 20, 15, 10, 5]),
            oct: StubAPI.report(oct, score: 64, previous: 73, points: [20, 20, 9, 10, 5]),
        ]
        let model = HealthModel(api: stub, cache: ReportCache(directory: dir, scope: scope), snapshots: snapshots,
                                scope: scope, calendar: Self.utc, sync: sync)
        await model.load(now: Self.date(2026, 11, 2))

        #expect(snapshots.load() == snapshot)
        #expect(widgets.reloads == 1)
        #expect(defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == oct.apiString)

        let notifier = QuietNotifier()
        let refresh = CheckupRefresh(
            scope: scope, snapshots: snapshots, defaults: defaults, calendar: Self.utc,
            hasSession: { true }, makeAPI: { stub }, notifier: notifier, scheduler: NoScheduler(), widgets: widgets)
        #expect(await refresh.run(api: stub, now: Self.date(2026, 11, 3)) == nil)
        #expect(notifier.posted.isEmpty)

        stub.reports[nov] = StubAPI.report(nov, score: 70, previous: 64, points: [22, 20, 12, 11, 5])
        #expect(await refresh.run(api: stub, now: Self.date(2026, 12, 2)) == "Your November check-up is ready")
    }

    @Test func markSeenNeverMovesBackwards() {
        let (sync, _, _, defaults, suite) = parts()
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let scope = AccountScope(userID: "user-a")
        sync.markSeen(oct, token: scope.token(), scope: scope)
        sync.markSeen(sep, token: scope.token(), scope: scope)
        #expect(defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == oct.apiString)
    }

    @Test func markSeenWithStaleTokenWritesNothing() {
        let (sync, _, _, defaults, suite) = parts()
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let scope = AccountScope(userID: "user-a")
        let token = scope.token()
        scope.end()
        sync.markSeen(oct, token: token, scope: scope)
        #expect(defaults.string(forKey: CheckupRefresh.lastNotifiedKey) == nil)
    }
}
