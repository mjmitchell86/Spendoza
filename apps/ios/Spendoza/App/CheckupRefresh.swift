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
    private let makeAPI: @Sendable () async -> any SpendozaAPI
    private let notifier: any CheckupNotifying
    private let scheduler: any CheckupScheduling
    private let widgets: any WidgetReloading

    /// - Parameter hasSession: true when a session token is readable right now; it also points `scope` at that user.
    init(scope: AccountScope, snapshots: SnapshotStore, defaults: UserDefaults = .standard,
         calendar: Calendar = .current,
         hasSession: @escaping @Sendable () async -> Bool,
         makeAPI: @escaping @Sendable () async -> any SpendozaAPI,
         notifier: any CheckupNotifying = SystemCheckupNotifier(),
         scheduler: any CheckupScheduling = SystemCheckupScheduler(),
         widgets: any WidgetReloading = SystemWidgetReloader()) {
        self.scope = scope
        self.snapshots = snapshots
        self.defaults = defaults
        self.calendar = calendar
        self.hasSession = hasSession
        self.makeAPI = makeAPI
        self.notifier = notifier
        self.scheduler = scheduler
        self.widgets = widgets
    }

    /// The app's instance, wired to the session store.
    static func live(store: SessionStore) -> CheckupRefresh {
        CheckupRefresh(
            scope: AppServices.accountScope, snapshots: AppServices.snapshots,
            hasSession: {
                guard await store.accessToken != nil else { return false }
                return await store.activateStoredSessionScope()
            },
            makeAPI: { await store.api })
    }

    // MARK: Scheduling

    /// Call once at launch, before the app finishes launching.
    func register() {
        scheduler.register(identifier: Self.taskIdentifier) { [self] task in
            nonisolated(unsafe) let task = task
            let work = Task {
                let api = await makeAPI()
                _ = await run(api: api, now: Date())
                schedule()
                task.setTaskCompleted(success: !Task.isCancelled)
            }
            task.expirationHandler = { work.cancel() }
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
        if snapshots.load() != snapshot {
            snapshots.save(snapshot, token: token, scope: scope)
            if scope.isCurrent(token) { widgets.reloadAll() }
        }

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

    /// Walks back from last month until a report answers; any error ends the search quietly.
    private func latestReport(api: any SpendozaAPI, now: Date) async -> Report? {
        var month = Month(date: now, calendar: calendar).previous
        for _ in 0..<Self.lookback {
            if Task.isCancelled { return nil }
            do {
                if let report = try await api.personalReport(month) { return report }
            } catch {
                return nil
            }
            month = month.previous
        }
        return nil
    }
}

// MARK: System implementations

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
