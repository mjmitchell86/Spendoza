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

/// Likewise the household calls.
extension HouseholdAPI {
    func household() async throws -> Household? { nil }
    func createHousehold(name: String) async throws -> String? { nil }
    func joinHousehold(code: String) async throws {}
    func rotateInviteCode() async throws -> String { throw APIError.offline }
    func renameHousehold(_ name: String) async throws {}
    func deleteHousehold(confirmName: String) async throws {}
    func invite(email: String) async throws {}
    func pendingInvitations() async throws -> [PendingInvitation] { [] }
    func revokeInvitation(id: String) async throws {}
    func myInvitations() async throws -> [MyInvitation] { [] }
    func acceptInvitation(id: String, code: String) async throws {}
    func declineInvitation(id: String, code: String) async throws {}
    func removeMember(id: String) async throws {}
    func makeHead(id: String) async throws {}
    func updateSharing(_ change: SharingChange) async throws {}
    func setCategoryShared(id: String, shared: Bool) async throws {}
    func leaveHousehold() async throws {}
}

/// Likewise the Money calls.
extension MoneyAPI {
    func expenses() async throws -> [Expense] { [] }
    func upcomingBills(from: Date) async throws -> [Expense] { [] }
    func saveExpense(_ draft: ExpenseDraft, id: String?) async throws -> Expense { throw APIError.offline }
    func deleteExpense(id: String) async throws {}
    func incomeEntries() async throws -> [IncomeEntry] { [] }
    func saveIncome(_ draft: IncomeDraft, id: String?) async throws -> IncomeEntry { throw APIError.offline }
    func deleteIncome(id: String) async throws {}
    func createCategory(name: String, budgetClass: BudgetClass, shared: Bool) async throws -> BudgetCategory { throw APIError.offline }
    func updateCategory(id: String, name: String, budgetClass: BudgetClass) async throws -> BudgetCategory { throw APIError.offline }
    func deleteCategory(id: String) async throws {}
    func generateReport(_ month: Month) async throws {}
    func attribute(transactionID: String, to userID: String) async throws {}
    func bulkAttribute(_ pairs: [(String, String)]) async throws -> [String: String?] { [:] }
}
