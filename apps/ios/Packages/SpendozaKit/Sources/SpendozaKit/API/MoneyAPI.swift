import Foundation

/// The Money tab's server calls. Failures carry the server's text (`APIError.message`).
public protocol MoneyAPI: Sendable {
    func expenses() async throws -> [Expense]
    /// Recurring bills due on or after `from`.
    func upcomingBills(from: Date) async throws -> [Expense]
    /// Creates the bill, or updates it when `id` is given.
    func saveExpense(_ draft: ExpenseDraft, id: String?) async throws -> Expense
    func deleteExpense(id: String) async throws
    func incomeEntries() async throws -> [IncomeEntry]
    /// Creates the entry, or updates it when `id` is given.
    func saveIncome(_ draft: IncomeDraft, id: String?) async throws -> IncomeEntry
    func deleteIncome(id: String) async throws
    func createCategory(name: String, budgetClass: BudgetClass, shared: Bool) async throws -> BudgetCategory
    func updateCategory(id: String, name: String, budgetClass: BudgetClass) async throws -> BudgetCategory
    func deleteCategory(id: String) async throws
    /// Rebuilds the report for one month (the server allows 2 per 24 hours).
    func generateReport(_ month: Month) async throws
    /// Assigns a transaction to a household member.
    func attribute(transactionID: String, to userID: String) async throws
    /// Transaction id to the server's error for it; nil when that one saved.
    func bulkAttribute(_ pairs: [(String, String)]) async throws -> [String: String?]
}
