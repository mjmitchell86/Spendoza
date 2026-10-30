import Foundation
import Testing
@testable import SpendozaKit

enum Fixture {
    static func data(_ name: String) throws -> Data {
        let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    static func report(_ name: String) throws -> Report {
        try JSONDecoder().decode(Report.self, from: data(name))
    }

    static var october: Report { get throws { try report("report-2026-10") } }
    static var september: Report { get throws { try report("report-2026-09") } }

    static let categories: [BudgetCategory] = [
        .init(id: "c1", name: "Housing", budgetClass: .need),
        .init(id: "c2", name: "Groceries", budgetClass: .need),
        .init(id: "c3", name: "Dining out", budgetClass: .want),
        .init(id: "c4", name: "Streaming", budgetClass: .want),
        .init(id: "c5", name: "Gym", budgetClass: .want),
    ]
}

/// Test doubles that only care about sign-in and reports get these: every account call is unused.
extension AccountAPI {
    func uploadAvatar(jpegData: Data) async throws -> Profile { throw APIError.offline }
    func signOutOtherSessions() async throws {}
    func deleteAccount() async throws {}
    func inviteCodes() async throws -> [InviteCode] { [] }
    func createInviteCode() async throws -> InviteCode { throw APIError.offline }
    func personalReportPDF(_ period: ReportPeriod) async throws -> PDFFile { throw APIError.offline }
    func sendTestEmail() async throws {}
}

/// Likewise the admin calls: unused by doubles that only care about sign-in and reports.
extension AdminAPI {
    func adminStats() async throws -> AdminStats { throw APIError.offline }
    func adminTrends(months: Int) async throws -> AdminTrends { throw APIError.offline }
    func adminUsers(_ q: AdminUserQuery) async throws -> AdminUserPage { throw APIError.offline }
    func adminUpdateUser(id: String, _ change: AdminUserChange) async throws {}
    func adminDeleteUser(id: String) async throws {}
    func adminRegenerateReport(userID: String) async throws {}
    func adminDetectRecurring(userID: String) async throws {}
    func adminSendQuarterlyReport(userID: String) async throws {}
    func adminSendAnnualReport(userID: String) async throws {}
}
