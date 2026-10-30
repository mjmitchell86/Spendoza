import Foundation

/// The admin console's server calls. Every one needs an admin account (others get "Admin access required").
public protocol AdminAPI: Sendable {
    func adminStats() async throws -> AdminStats
    func adminTrends(months: Int) async throws -> AdminTrends
    func adminUsers(_ q: AdminUserQuery) async throws -> AdminUserPage
    func adminUpdateUser(id: String, _ change: AdminUserChange) async throws
    /// Deletes the user and all their data. The server refuses your own account and a household head with members.
    func adminDeleteUser(id: String) async throws
    func adminRegenerateReport(userID: String) async throws
    func adminDetectRecurring(userID: String) async throws
    /// Emails the last full quarter's report; the server picks the period.
    func adminSendQuarterlyReport(userID: String) async throws
    /// Emails last year's report; the server picks the period.
    func adminSendAnnualReport(userID: String) async throws
}
