import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct AdminDashboardModelTests {
    private let stats = AdminStats(
        users: .init(totalUsers: 8, freeUsers: 5, starterUsers: 2, proUsers: 1, adminUsers: 2),
        activity: .init(totalTransactions: 12_480, totalReports: 40, totalEmailsSent: 1_200, totalGoals: 12, totalHouseholds: 4))

    private func trends() -> AdminTrends {
        AdminTrends(
            userTrends: [.init(month: "2026-09-01", newUsers: 3), .init(month: "2026-10-01", newUsers: 5)],
            activityTrends: [
                .init(month: "2026-10-01", metric: "transactions", count: 100),
                .init(month: "2026-10-01", metric: "goals", count: 9),
                .init(month: "2026-10-01", metric: "reports", count: 4),
                .init(month: "2026-10-01", metric: "emails", count: 7),
            ],
            llmStats: [])
    }

    private func loaded() async -> (AdminDashboardModel, StubAPI) {
        let api = StubAPI()
        api.adminStatsResult = .success(stats)
        api.adminTrendsResult = .success(trends())
        let m = AdminDashboardModel(api: api)
        await m.load()
        return (m, api)
    }

    @Test func loadFetchesStatsAndTwelveMonthsOfTrends() async {
        let (m, api) = await loaded()
        #expect(m.stats == stats)
        #expect(m.trends == trends())
        #expect(m.error == nil)
        #expect(Set(api.calls) == ["adminStats", "adminTrends(12)"])
    }

    @Test func tilesRunInTheWebsOrderWithGroupedNumbers() async {
        let (m, _) = await loaded()
        #expect(m.tiles == [
            AdminTile(title: "Total users", value: "8", detail: "2 admins"),
            AdminTile(title: "Subscribers", value: "3", detail: "5 free / 2 starter / 1 pro"),
            AdminTile(title: "Transactions", value: "12,480", detail: "Total ingested"),
            AdminTile(title: "Reports", value: "40", detail: "Total generated"),
            AdminTile(title: "Emails sent", value: "1,200", detail: nil),
            AdminTile(title: "Goals", value: "12", detail: nil),
            AdminTile(title: "Households", value: "4", detail: nil),
        ])
    }

    @Test func noTilesBeforeTheStatsLoad() {
        #expect(AdminDashboardModel(api: StubAPI()).tiles.isEmpty)
    }

    @Test func activitySeriesKeepsTransactionsReportsAndEmails() async {
        let (m, _) = await loaded()
        #expect(m.activitySeries.map(\.metric) == ["transactions", "reports", "emails"])
        #expect(m.activitySeries.first?.month == "2026-10")
        #expect(m.activitySeries.map(\.count) == [100, 4, 7])
    }

    @Test func monthsReadAsShortNames() {
        #expect(AdminDashboardModel.monthLabel("2026-10-01") == "Oct")
        #expect(AdminDashboardModel.monthLabel("2026-03-01T00:00:00+00:00") == "Mar")
        #expect(AdminDashboardModel.monthLabel("2026-10") == "Oct")
        #expect(AdminDashboardModel.monthYearLabel("2026-10-01") == "Oct 2026")
    }

    @Test func costShowsFourDecimalsOrADash() {
        #expect(AdminDashboardModel.cost(0.0123) == "$0.0123")
        #expect(AdminDashboardModel.cost(12) == "$12.0000")
        #expect(AdminDashboardModel.cost(nil) == "—")
    }

    @Test func aNonAdminSeesAdminAccessRequired() async {
        let api = StubAPI()
        api.adminStatsResult = .failure(.message("Admin access required"))
        api.adminTrendsResult = .failure(.message("Admin access required"))
        let m = AdminDashboardModel(api: api)
        await m.load()
        #expect(m.error == "Admin access required")
        #expect(m.stats == nil)
    }

    @Test func offlineShowsTheOfflineWords() async {
        let api = StubAPI()
        api.adminTrendsResult = .failure(.offline)
        let m = AdminDashboardModel(api: api)
        await m.load()
        #expect(m.error == APIError.offline.userMessage)
    }
}
