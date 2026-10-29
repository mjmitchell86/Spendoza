import SpendozaKit

/// Per-device stores shared by the app and (for the snapshot) the widget.
enum AppServices {
    static let appGroup = "group.com.gravitaz.spendoza"
    static let reportCache = ReportCache()
    static let snapshots = SnapshotStore(appGroup: appGroup)

    /// Signed out: the next account on this phone must not see the previous person's data.
    static func clearAccountData() {
        reportCache.clear()
        snapshots.clear()
    }
}
