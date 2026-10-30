import SpendozaKit
import WidgetKit

/// Per-device stores shared by the app and (for the snapshot) the widget.
enum AppServices {
    static let appGroup = "group.com.gravitaz.spendoza"
    /// Whose data the caches hold; ended on sign-out so late writes are dropped.
    static let accountScope = AccountScope()
    static let reportCache = ReportCache(scope: accountScope)
    static let profileCache = ProfileCache(scope: accountScope)
    static let snapshots = SnapshotStore(appGroup: appGroup)

    /// Signed out: the next account on this phone must not see the previous person's data.
    static func clearAccountData() {
        reportCache.clear()
        profileCache.clear()
        snapshots.clear()
        PDFReportsModel.clearExports()
        CheckupRefresh.clearLastNotified()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
