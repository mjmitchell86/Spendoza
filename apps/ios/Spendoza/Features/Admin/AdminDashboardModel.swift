import Foundation
import Observation
import SpendozaKit

/// One figure on the dashboard: a title, the value, and a line of detail under it.
struct AdminTile: Equatable {
    let title: String
    let value: String
    let detail: String?
}

/// The admin dashboard's numbers: platform totals, 12 months of trends and LLM usage.
@Observable @MainActor
final class AdminDashboardModel {
    private(set) var stats: AdminStats?
    private(set) var trends: AdminTrends?
    private(set) var loading = false
    /// The last failure, in words for the screen; cleared when the next load starts.
    private(set) var error: String?

    @ObservationIgnored private let api: any SpendozaAPI

    init(api: any SpendozaAPI) { self.api = api }

    func load() async {
        loading = true
        error = nil
        defer { loading = false }
        async let statsCall = api.adminStats()
        async let trendsCall = api.adminTrends(months: 12)
        do {
            let (stats, trends) = try await (statsCall, trendsCall)
            self.stats = stats
            self.trends = trends
        } catch {
            self.error = (error as? APIError)?.userMessage ?? "Couldn't load the dashboard. Try again."
        }
    }

    var tiles: [AdminTile] {
        guard let stats else { return [] }
        let u = stats.users, a = stats.activity
        return [
            AdminTile(title: "Total users", value: Self.number(u.totalUsers), detail: "\(Self.number(u.adminUsers)) admins"),
            AdminTile(title: "Subscribers", value: Self.number(u.starterUsers + u.proUsers),
                      detail: "\(Self.number(u.freeUsers)) free / \(Self.number(u.starterUsers)) starter / \(Self.number(u.proUsers)) pro"),
            AdminTile(title: "Transactions", value: Self.number(a.totalTransactions), detail: "Total ingested"),
            AdminTile(title: "Reports", value: Self.number(a.totalReports), detail: "Total generated"),
            AdminTile(title: "Emails sent", value: Self.number(a.totalEmailsSent), detail: nil),
            AdminTile(title: "Goals", value: Self.number(a.totalGoals), detail: nil),
            AdminTile(title: "Households", value: Self.number(a.totalHouseholds), detail: nil),
        ]
    }

    /// The Activity trends chart's metrics, in legend order.
    nonisolated static let activityMetrics = ["transactions", "reports", "emails"]

    /// Only the charted metrics, by month then legend order. `month` is the "yyyy-MM" key (see `monthLabel`).
    var activitySeries: [(month: String, metric: String, count: Int)] {
        (trends?.activityTrends ?? [])
            .compactMap { trend in
                Self.activityMetrics.firstIndex(of: trend.metric).map { (String(trend.month.prefix(7)), $0, trend) }
            }
            .sorted { ($0.0, $0.1) < ($1.0, $1.1) }
            .map { (month: $0.0, metric: $0.2.metric, count: $0.2.count) }
    }

    var signups: [(month: String, count: Int)] {
        (trends?.userTrends ?? []).map { (month: String($0.month.prefix(7)), count: $0.newUsers) }
    }

    // MARK: Formatting

    nonisolated static func number(_ value: Int) -> String {
        value.formatted(.number.grouping(.automatic).locale(Locale(identifier: "en_US")))
    }

    /// "Oct" for a month key or timestamp that starts "yyyy-MM".
    nonisolated static func monthLabel(_ month: String) -> String { format(month, "MMM") }

    /// "Oct 2026".
    nonisolated static func monthYearLabel(_ month: String) -> String { format(month, "MMM yyyy") }

    nonisolated private static func format(_ month: String, _ pattern: String) -> String {
        let parts = month.prefix(7).split(separator: "-")
        guard parts.count == 2, let year = Int(parts[0]), let m = Int(parts[1]), (1...12).contains(m) else { return month }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        guard let date = calendar.date(from: DateComponents(year: year, month: m, day: 1)) else { return month }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    /// "$0.0123", or a dash when the model has no price on file.
    nonisolated static func cost(_ value: Double?) -> String {
        guard let value else { return "—" }
        return "$" + String(format: "%.4f", value)
    }
}
