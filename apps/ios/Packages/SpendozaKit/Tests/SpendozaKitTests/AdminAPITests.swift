import Foundation
import Testing
@testable import SpendozaKit

/// Shares `APIClientTests`' suite: the `StubURLProtocol` handler is process-wide.
extension APIClientTests {
    // MARK: stats

    @Test func statsDecodeNumbersAndNumericStrings() async throws {
        let log = stub(body: """
        {"users":{"total_users":"12","free_users":5,"starter_users":"4","pro_users":3,"admin_users":"1"},
         "activity":{"total_transactions":"1500","total_reports":20,"total_emails_sent":"7","total_goals":3,"total_households":"2"}}
        """)
        let stats = try await client().adminStats()
        #expect(log.all.first?.method == "GET")
        #expect(log.all.first?.path == "/api/admin/stats")
        #expect(stats.users.totalUsers == 12)
        #expect(stats.users.freeUsers == 5)
        #expect(stats.users.starterUsers == 4)
        #expect(stats.users.adminUsers == 1)
        #expect(stats.activity.totalTransactions == 1500)
        #expect(stats.activity.totalEmailsSent == 7)
        #expect(stats.activity.totalHouseholds == 2)
    }

    @Test func flexibleNumberRejectsNonNumbers() {
        let json = #"{"users":{"total_users":"many","free_users":0,"starter_users":0,"pro_users":0,"admin_users":0},"activity":{"total_transactions":0,"total_reports":0,"total_emails_sent":0,"total_goals":0,"total_households":0}}"#
        #expect(throws: DecodingError.self) { try APICoding.makeDecoder().decode(AdminStats.self, from: Data(json.utf8)) }
    }

    // MARK: trends

    @Test func trendsDecodeWithANullCost() async throws {
        let log = stub(body: """
        {"user_trends":[{"month":"2026-09","new_users":"3"}],
         "activity_trends":[{"month":"2026-09","metric":"transactions","count":"120"}],
         "llm_stats":[{"month":"2026-09","call_type":"categorize","call_count":"4","total_tokens":"4000","avg_tokens":"1000","min_tokens":900,"max_tokens":1200,"total_cost":null},
                      {"month":"2026-09","call_type":"insights","call_count":1,"total_tokens":500,"avg_tokens":500,"min_tokens":500,"max_tokens":500,"total_cost":"0.0123"}]}
        """)
        let trends = try await client().adminTrends(months: 12)
        #expect(log.all.first?.path == "/api/admin/stats/trends")
        #expect(log.all.first?.query == ["months": "12"])
        #expect(trends.userTrends.first?.newUsers == 3)
        #expect(trends.activityTrends.first?.metric == "transactions")
        #expect(trends.activityTrends.first?.count == 120)
        #expect(trends.llmStats.map(\.totalCost) == [nil, 0.0123])
        #expect(trends.llmStats.first?.callCount == 4)
        #expect(trends.llmStats.first?.maxTokens == 1200)
    }

    // MARK: users

    private static let usersBody = """
    {"users":[{"id":"u1","display_name":"Ann","email":"ann@example.test","subscription_tier":"pro","is_admin":false,"disabled":true,"created_at":"2026-03-04T10:00:00.000Z"},
              {"id":"u2","display_name":"Bo","email":null,"subscription_tier":"free","is_admin":true,"disabled":false,"created_at":"2026-03-05T10:00:00.000Z"}],
     "total":"41","page":2,"limit":25}
    """

    @Test func usersQuerySendsPageLimitSearchAndTier() async throws {
        let log = stub(body: Self.usersBody)
        let page = try await client().adminUsers(AdminUserQuery(page: 2, search: "ann", tier: "pro"))
        #expect(log.all.first?.path == "/api/admin/users")
        #expect(log.all.first?.query == ["page": "2", "limit": "25", "search": "ann", "tier": "pro"])
        #expect(page.total == 41)
        #expect(page.page == 2)
        #expect(page.limit == 25)
        #expect(page.users.map(\.id) == ["u1", "u2"])
        #expect(page.users[0].tier == "pro")
        #expect(page.users[0].disabled)
        #expect(page.users[1].email == nil)
        #expect(page.users[1].isAdmin)
    }

    @Test func defaultUsersQueryOmitsSearchAndTier() async throws {
        let log = stub(body: Self.usersBody)
        _ = try await client().adminUsers(AdminUserQuery())
        #expect(log.all.first?.query == ["page": "1", "limit": "25"])
    }

    @Test func emptySearchAndTierAreOmitted() async throws {
        let log = stub(body: Self.usersBody)
        _ = try await client().adminUsers(AdminUserQuery(search: "", tier: ""))
        #expect(log.all.first?.query == ["page": "1", "limit": "25"])
    }

    @Test func updateUserSendsOnlyTheChangedKey() async throws {
        let log = stub(body: "{}")
        try await client().adminUpdateUser(id: "u1", .init(tier: "starter"))
        let sent = try #require(log.all.first)
        #expect(sent.method == "PATCH")
        #expect(sent.path == "/api/admin/users/u1")
        #expect(String(decoding: sent.body, as: UTF8.self) == #"{"subscription_tier":"starter"}"#)
    }

    @Test func updateUserSendsAdminAndDisabledFlags() async throws {
        let log = stub(body: "{}")
        try await client().adminUpdateUser(id: "u1", .init(isAdmin: true, disabled: false))
        #expect(log.all.first?.json as? [String: Bool] == ["is_admin": true, "disabled": false])
    }

    @Test func nonAdminsGetTheAdminAccessMessage() async {
        stub(status: 403, body: #"{"error":"Admin access required"}"#)
        await expectError(.message("Admin access required")) { try await client().adminStats() }
    }

    @Test func deletingYourselfShowsTheServerMessage() async {
        stub(status: 400, body: #"{"error":"Cannot delete your own account"}"#)
        await expectError(.message("Cannot delete your own account")) { try await client().adminDeleteUser(id: "me") }
    }

    @Test func deleteUserSendsDELETE() async throws {
        let log = stub(body: #"{"deleted":true}"#)
        try await client().adminDeleteUser(id: "u1")
        #expect(log.all.first?.method == "DELETE")
        #expect(log.all.first?.path == "/api/admin/users/u1")
    }

    // MARK: per-user actions

    @Test func userActionsPostToTheirPathsWithoutABody() async throws {
        let c = client()
        let cases: [(String, @Sendable (APIClient) async throws -> Void)] = [
            ("generate-report", { try await $0.adminRegenerateReport(userID: "u1") }),
            ("detect-recurring", { try await $0.adminDetectRecurring(userID: "u1") }),
            ("send-quarterly-report", { try await $0.adminSendQuarterlyReport(userID: "u1") }),
            ("send-annual-report", { try await $0.adminSendAnnualReport(userID: "u1") }),
        ]
        for (suffix, call) in cases {
            let log = stub(body: "{}")
            try await call(c)
            let sent = try #require(log.all.first)
            #expect(sent.method == "POST")
            #expect(sent.path == "/api/admin/users/u1/\(suffix)")
            #expect(sent.body.isEmpty)
        }
    }

    @Test func failedSendShowsTheServerMessage() async {
        stub(status: 500, body: #"{"error":"Email provider down"}"#)
        await expectError(.message("Email provider down")) { try await client().adminSendQuarterlyReport(userID: "u1") }
    }
}
