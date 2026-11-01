import Foundation

/// Everything the app asks of the Spendoza server. App models depend on this protocol so tests can stub it.
public protocol SpendozaAPI: AccountAPI, AdminAPI, HouseholdAPI, MoneyAPI {
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
    /// `bankName` is sent as the `bank_name` field when it has text; `accountLabel` likewise as `account_label`.
    /// `shared` marks a household account (`is_shared_account`).
    func uploadStatement(fileURL: URL, mimeType: String, bankName: String?, shared: Bool, accountLabel: String?) async throws -> Statement
    func statements() async throws -> [Statement]
    func reprocessStatement(id: String) async throws
    func removeStatement(id: String) async throws
    /// Creates the account; the result says whether the invite or invitation code joined a household.
    @discardableResult
    func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws -> SignUpResult
    func joinWaitlist(name: String, email: String) async throws
}

extension SpendozaAPI {
    /// A personal account with no label (what onboarding uploads).
    public func uploadStatement(fileURL: URL, mimeType: String, bankName: String?) async throws -> Statement {
        try await uploadStatement(fileURL: fileURL, mimeType: mimeType, bankName: bankName, shared: false, accountLabel: nil)
    }
}
