import Foundation

/// Everything the app asks of the Spendoza server. App models depend on this protocol so tests can stub it.
public protocol SpendozaAPI: AccountAPI, AdminAPI {
    func profile() async throws -> Profile
    func completeOnboarding() async throws
    func updateProfile(_ change: ProfileChange) async throws -> Profile
    /// `nil` when the server has no report for that month (404).
    func personalReport(_ month: Month) async throws -> Report?
    func categories() async throws -> [BudgetCategory]
    func transactions(from: Date, to: Date) async throws -> [Transaction]
    func setCategory(transactionID: String, category: String?) async throws
    func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws
    /// The transactions extracted from one statement.
    func transactions(statementID: String) async throws -> [Transaction]
    /// `bankName` is sent as the `bank_name` field when it has text.
    func uploadStatement(fileURL: URL, mimeType: String, bankName: String?) async throws -> Statement
    func statements() async throws -> [Statement]
    func reprocessStatement(id: String) async throws
    func removeStatement(id: String) async throws
    func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws
    func joinWaitlist(name: String, email: String) async throws
}
