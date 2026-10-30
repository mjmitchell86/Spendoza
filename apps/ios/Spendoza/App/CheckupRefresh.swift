import BackgroundTasks
import Foundation
import SpendozaKit
import UserNotifications
import WidgetKit

// MARK: Seams (real implementations at the bottom; tests use fakes)

protocol CheckupNotifying: Sendable {
    /// True when the person has allowed notifications.
    func canPost() async -> Bool
    func post(body: String) async
    func requestAuthorization() async
}

protocol WidgetReloading: Sendable {
    func reloadAll()
}

/// The parts of a background task the refresh uses (`SystemBackgroundTask` wraps `BGTask`; tests use a fake).
protocol BackgroundTaskHandle: Sendable {
    func setExpirationHandler(_ handler: @escaping @Sendable () -> Void)
    func setTaskCompleted(success: Bool)
}

protocol CheckupScheduling: Sendable {
    func register(identifier: String, handler: @escaping @Sendable (BGAppRefreshTask) -> Void)
    func submit(_ request: BGAppRefreshTaskRequest) throws
}

/// Looks for a new monthly check-up in the background, refreshes the widget snapshot and posts
/// "Your <Month> check-up is ready".
///
/// It never touches `ReportCache` (that is file-protected and unreadable while the phone is locked).
/// It reads reports through the API, writes only the App Group `SnapshotStore` (through the account
/// scope, so a sign-out mid-flight drops the write) and the `lastNotifiedCheckup` default, and does
/// nothing when there is no session token (signed out, or the keychain is locked).
/// Only the four snapshot fields and the month name ever leave this class.
final class CheckupRefresh: @unchecked Sendable {  // UserDefaults is thread-safe; everything else is immutable
    static let taskIdentifier = "com.gravitaz.spendoza.checkup"
    static let lastNotifiedKey = "lastNotifiedCheckup"
    private static let permissionAskedKey = "checkupPermissionAsked"
    /// How many months back (before the current one) a run will look for the latest report.
    private static let lookback = 5

    private let scope: AccountScope
    private let snapshots: SnapshotStore
    private let defaults: UserDefaults
    private let calendar: Calendar
    private let hasSession: @Sendable () async -> Bool
    private let hasStoredSession: @Sendable () async -> Bool
    private let makeAPI: @Sendable () async -> any SpendozaAPI
    private let notifier: any CheckupNotifying
    private let scheduler: any CheckupScheduling
    private let widgets: any WidgetReloading
    private let sync: WidgetSync

    /// - Parameters:
    ///   - hasSession: true when a session token is readable right now; it also points `scope` at that user.
    ///   - hasStoredSession: true when this phone is signed in at all (even if the keychain is locked right now);
    ///     a signed-out phone stops asking for daily runs.
    init(scope: AccountScope, snapshots: SnapshotStore, defaults: UserDefaults = .standard,
         calendar: Calendar = .current,
         hasSession: @escaping @Sendable () async -> Bool,
         hasStoredSession: @escaping @Sendable () async -> Bool,
         makeAPI: @escaping @Sendable () async -> any SpendozaAPI,
         notifier: any CheckupNotifying = SystemCheckupNotifier(),
         scheduler: any CheckupScheduling = SystemCheckupScheduler(),
         widgets: any WidgetReloading = SystemWidgetReloader()) {
        self.scope = scope
        self.snapshots = snapshots
        self.defaults = defaults
        self.calendar = calendar
        self.hasSession = hasSession
        self.hasStoredSession = hasStoredSession
        self.makeAPI = makeAPI
        self.notifier = notifier
        self.scheduler = scheduler
        self.widgets = widgets
        self.sync = WidgetSync(snapshots: snapshots, widgets: widgets, defaults: defaults)
    }

    /// The app's instance, wired to the session store.
    static func live(store: SessionStore) -> CheckupRefresh {
        CheckupRefresh(
            scope: AppServices.accountScope, snapshots: AppServices.snapshots,
            hasSession: {
                guard await store.accessToken != nil else { return false }
                return await store.activateStoredSessionScope()
            },
            hasStoredSession: { await store.activateStoredSessionScope() },
            makeAPI: { await store.api })
    }

    // MARK: Scheduling

    /// Call once at launch, before the app finishes launching.
    func register() {
        scheduler.register(identifier: Self.taskIdentifier) { [self] task in
            handle(SystemBackgroundTask(task))
        }
    }

    /// One background run: look for a check-up, ask for tomorrow's run while signed in, complete the task.
    /// When the system expires the task, the handler completes it (as failed) at once and cancels the work.
    func handle(_ task: any BackgroundTaskHandle, now: Date = Date()) {
        let completion = OnceCompletion(task)
        let work = Task {
            let api = await makeAPI()
            _ = await run(api: api, now: now)
            if await hasStoredSession() { schedule(now: now) }
            completion.finish(success: !Task.isCancelled)
        }
        task.setExpirationHandler {
            work.cancel()
            completion.finish(success: false)
        }
    }

    /// Asks for the next run at 10:00 local tomorrow, after the 09:00 UTC report job.
    func schedule(now: Date = Date()) {
        guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)),
              let tenAM = calendar.date(bySettingHour: 10, minute: 0, second: 0, of: tomorrow)
        else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        request.earliestBeginDate = tenAM
        try? scheduler.submit(request)
    }

    // MARK: Permission

    /// Asks for notification permission the first time only; a "no" is never asked again.
    func requestPermissionIfNeeded() async {
        guard !defaults.bool(forKey: Self.permissionAskedKey) else { return }
        defaults.set(true, forKey: Self.permissionAskedKey)
        await notifier.requestAuthorization()
    }

    // MARK: Running

    /// Looks for a check-up newer than the last one announced. Returns the posted notification body (for tests).
    @discardableResult
    func run(api: any SpendozaAPI, now: Date) async -> String? {
        guard await hasSession(), scope.userID != nil else { return nil }
        let token = scope.token()

        guard let report = await latestReport(api: api, now: now), let health = report.data.health else { return nil }
        guard scope.isCurrent(token), !Task.isCancelled else { return nil }

        let snapshot = WidgetSnapshot(score: health.score, band: ScoreBand(score: health.score),
                                      previousScore: health.previousScore, month: report.month)
        sync.save(snapshot, token: token, scope: scope)

        let lastNotified = defaults.string(forKey: Self.lastNotifiedKey).flatMap(Month.init(apiString:))
        guard let body = checkupNotice(latestCheckup: report.month, lastNotified: lastNotified),
              scope.isCurrent(token)
        else { return nil }
        defaults.set(report.month.apiString, forKey: Self.lastNotifiedKey)
        guard await notifier.canPost() else { return nil }
        await notifier.post(body: body)
        return body
    }

    /// Sign-out: the next account must hear about its own check-up.
    func clearAccountState() {
        Self.clearLastNotified(in: defaults)
    }

    static func clearLastNotified(in defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: lastNotifiedKey)
    }

    /// Walks back from last month until a report with data answers (an all-zero report is no check-up, R42);
    /// any error ends the search quietly.
    private func latestReport(api: any SpendozaAPI, now: Date) async -> Report? {
        var month = Month(date: now, calendar: calendar).previous
        for _ in 0..<Self.lookback {
            if Task.isCancelled { return nil }
            do {
                if let report = try await api.personalReport(month), !report.data.hasNoData { return report }
            } catch {
                return nil
            }
            month = month.previous
        }
        return nil
    }
}

/// Keeps the widget in step with what the app has seen. Used by the foreground Health load and the background run.
final class WidgetSync: @unchecked Sendable {  // UserDefaults is thread-safe
    private let snapshots: SnapshotStore
    private let widgets: any WidgetReloading
    private let defaults: UserDefaults

    init(snapshots: SnapshotStore, widgets: any WidgetReloading = SystemWidgetReloader(),
         defaults: UserDefaults = .standard) {
        self.snapshots = snapshots
        self.widgets = widgets
        self.defaults = defaults
    }

    /// Saves under the scope token and reloads widget timelines, only when the snapshot changed
    /// and no sign-out or account change happened meanwhile.
    func save(_ snapshot: WidgetSnapshot, token: AccountScope.Token, scope: AccountScope) {
        guard scope.isCurrent(token), snapshots.load() != snapshot else { return }
        snapshots.save(snapshot, token: token, scope: scope)
        if scope.isCurrent(token) { widgets.reloadAll() }
    }

    /// The app has shown this check-up, so the "ready" notice for it would be stale.
    func markSeen(_ month: Month, token: AccountScope.Token, scope: AccountScope) {
        guard scope.isCurrent(token) else { return }
        let stored = defaults.string(forKey: CheckupRefresh.lastNotifiedKey).flatMap(Month.init(apiString:))
        if let stored, stored >= month { return }
        defaults.set(month.apiString, forKey: CheckupRefresh.lastNotifiedKey)
    }
}

/// Completes a background task exactly once, whichever of the work and the expiration handler gets there first.
private final class OnceCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private let task: any BackgroundTaskHandle
    private var done = false

    init(_ task: any BackgroundTaskHandle) { self.task = task }

    func finish(success: Bool) {
        let first = lock.withLock { () -> Bool in
            guard !done else { return false }
            done = true
            return true
        }
        if first { task.setTaskCompleted(success: success) }
    }
}

// MARK: System implementations

final class SystemBackgroundTask: BackgroundTaskHandle, @unchecked Sendable {  // BGTask is thread-safe for these
    private let task: BGTask
    init(_ task: BGTask) { self.task = task }
    func setExpirationHandler(_ handler: @escaping @Sendable () -> Void) { task.expirationHandler = handler }
    func setTaskCompleted(success: Bool) { task.setTaskCompleted(success: success) }
}

struct SystemCheckupNotifier: CheckupNotifying {
    func canPost() async -> Bool {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .authorized, .provisional, .ephemeral: true
        default: false
        }
    }

    func post(body: String) async {
        let content = UNMutableNotificationContent()
        content.title = "Spendoza"
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(identifier: CheckupRefresh.taskIdentifier, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    func requestAuthorization() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
    }
}

struct SystemWidgetReloader: WidgetReloading {
    func reloadAll() { WidgetCenter.shared.reloadAllTimelines() }
}

struct SystemCheckupScheduler: CheckupScheduling {
    func register(identifier: String, handler: @escaping @Sendable (BGAppRefreshTask) -> Void) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            handler(task)
        }
    }

    func submit(_ request: BGAppRefreshTaskRequest) throws {
        try BGTaskScheduler.shared.submit(request)
    }
}
