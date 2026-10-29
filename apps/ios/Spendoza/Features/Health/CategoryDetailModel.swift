import Foundation
import Observation
import SpendozaKit

enum BudgetResult: Equatable {
    case saved, notOnPlan
    case failed(String)
}

/// The five months ending at `month`, oldest first.
func fiveMonths(endingAt month: Month) -> [Month] {
    var months = [month]
    while months.count < 5 { months.insert(months[0].previous, at: 0) }
    return months
}

/// What to tell a person when a call failed.
func userMessage(for error: Error) -> String {
    (error as? APIError)?.userMessage ?? "Something went wrong. Try again."
}

/// Creates the category budget goal the way the web's goal form does (`goal_type: "budget"`).
/// A 403 for the plan is its own result so the screen can say so; amounts must be above zero.
func saveBudgetGoal(api: any SpendozaAPI, categoryID: String, goalName: String, amount: Int) async -> BudgetResult {
    let name = goalName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return .failed("Enter a name for the budget.") }
    guard amount > 0 else { return .failed("Enter an amount above $0.") }
    do {
        try await api.createBudgetGoal(name: name, categoryID: categoryID, amount: amount)
        return .saved
    } catch let error as APIError {
        if case .notOnPlan = error { return .notOnPlan }
        return .failed(error.userMessage)
    } catch {
        return .failed(userMessage(for: error))
    }
}

/// One spending category in the check-up month: its amount, change, typical month, trend and transactions.
/// Reports come from the snapshot (no refetch); transactions and the category list are loaded by `load()`.
@MainActor @Observable
final class CategoryDetailModel {
    struct Move: Equatable {
        let transaction: Transaction
        let from: String
        /// The new category; nil means Uncategorized.
        let to: String?
        var destination: String { to ?? "Uncategorized" }
    }

    let category: BudgetCategory
    let snapshot: HealthSnapshot
    private(set) var transactions: [Transaction] = []
    private(set) var categories: [BudgetCategory] = []
    /// Why the category list couldn't load (the picker then offers a retry).
    private(set) var categoriesError: String?
    private(set) var isLoading = true
    /// Why the transactions couldn't load.
    private(set) var loadError: String?
    /// Why the last recategorize (or undo) failed.
    private(set) var actionError: String?
    /// The last successful move, for the Undo bar.
    private(set) var lastMove: Move?
    private(set) var budgetSaved = false
    /// Dollars of this category's debits moved out in this visit, so the total and change stay honest
    /// (the server never regenerates a finished month's report).
    private(set) var movedOut = 0.0

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let calendar: Calendar

    init(category: BudgetCategory, snapshot: HealthSnapshot, api: any SpendozaAPI, calendar: Calendar = .current) {
        self.category = category
        self.snapshot = snapshot
        self.api = api
        self.calendar = calendar
    }

    var month: Month { snapshot.report.month }
    /// "September", the month the change is measured against; only meaningful when `delta` isn't nil.
    var sinceName: String { month.previous.name }

    private func amount(in report: Report) -> Double? {
        let rows = report.data.byCategory.filter { $0.category == category.name }
        return rows.isEmpty ? nil : rows.reduce(0) { $0 + $1.amount }
    }

    /// The report's amount for the category.
    private var reportedTotal: Double { amount(in: snapshot.report) ?? 0 }

    /// The reported amount less what has been moved out since.
    var total: Double { reportedTotal - movedOut }

    /// Change since the calendar-previous month; nil without that month's report or when the category is new.
    var delta: Double? {
        guard let previous = snapshot.previous, let before = amount(in: previous) else { return nil }
        return total - before
    }

    /// Average over the history months that have reports (a month without a row counts as 0); nil with no history.
    var typicalMonthly: Double? {
        guard !snapshot.history.isEmpty else { return nil }
        let sum = snapshot.history.reduce(0.0) { $0 + (amount(in: $1) ?? 0) }
        return sum / Double(snapshot.history.count)
    }

    var trendMonths: [Month] { fiveMonths(endingAt: month) }

    /// Amount per month for the five months ending at the check-up month; a month without a report is absent.
    var trend: [Month: Double] {
        var out: [Month: Double] = [month: total]
        for report in snapshot.history where trendMonths.contains(report.month) {
            out[report.month] = amount(in: report) ?? 0
        }
        return out
    }

    /// The goal's name, prefilled in the budget sheet.
    var defaultBudgetName: String { "\(category.name) budget" }

    var suggestedBudget: Int {
        suggestedBudgetAmount(for: category.name, currentAmount: reportedTotal, history: snapshot.history)
    }

    /// The categories a transaction can move to, by name (the web's list, minus this one).
    var moveTargets: [BudgetCategory] {
        categories.filter { $0.name != category.name }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    // MARK: Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        loadError = nil
        let (start, end) = monthBounds()
        // Both at once (10.50).
        let api = self.api
        async let categoryList = Self.categories(api)
        async let transactionList = Self.transactions(api, from: start, to: end)
        apply(await categoryList)
        switch await transactionList {
        case .success(let all):
            transactions = Self.sorted(all.filter { $0.type == .debit && $0.category == category.name })
        case .failure(let error):
            loadError = userMessage(for: error)
        }
    }

    /// The picker's "Try again" after the category list failed.
    func retryCategories() async {
        apply(await Self.categories(api))
    }

    private nonisolated static func categories(_ api: any SpendozaAPI) async -> Result<[BudgetCategory], Error> {
        do { return .success(try await api.categories()) } catch { return .failure(error) }
    }

    private nonisolated static func transactions(_ api: any SpendozaAPI, from start: Date, to end: Date) async
        -> Result<[Transaction], Error> {
        do { return .success(try await api.transactions(from: start, to: end)) } catch { return .failure(error) }
    }

    private func apply(_ result: Result<[BudgetCategory], Error>) {
        switch result {
        case .success(let list):
            categories = list
            categoriesError = nil
        case .failure(let error):
            categories = []
            categoriesError = userMessage(for: error)
        }
    }

    private func monthBounds() -> (Date, Date) {
        let first = calendar.date(from: DateComponents(year: month.year, month: month.month, day: 1, hour: 12)) ?? .now
        let days = calendar.range(of: .day, in: .month, for: first)?.count ?? 28
        let last = calendar.date(from: DateComponents(year: month.year, month: month.month, day: days, hour: 12)) ?? first
        return (first, last)
    }

    /// Newest first.
    private static func sorted(_ list: [Transaction]) -> [Transaction] {
        list.enumerated().sorted { a, b in
            a.element.date != b.element.date ? a.element.date > b.element.date : a.offset < b.offset
        }.map(\.element)
    }

    // MARK: Actions

    /// Moves a transaction to another category: the row goes at once and comes back with an error if the call fails.
    func recategorize(_ transaction: Transaction, to name: String?) async {
        guard let index = transactions.firstIndex(where: { $0.id == transaction.id }) else { return }
        actionError = nil
        transactions.remove(at: index)
        movedOut += transaction.amount
        do {
            try await api.setCategory(transactionID: transaction.id, category: name)
            lastMove = Move(transaction: transaction, from: category.name, to: name)
        } catch {
            restore(transaction)
            movedOut -= transaction.amount
            actionError = userMessage(for: error)
        }
    }

    /// Moves the last transaction back to this category.
    func undoLastMove() async {
        guard let move = lastMove else { return }
        actionError = nil
        lastMove = nil
        restore(move.transaction)
        movedOut -= move.transaction.amount
        do {
            try await api.setCategory(transactionID: move.transaction.id, category: move.from)
        } catch {
            transactions.removeAll { $0.id == move.transaction.id }
            movedOut += move.transaction.amount
            lastMove = move
            actionError = userMessage(for: error)
        }
    }

    func dismissMove() { lastMove = nil }

    private func restore(_ transaction: Transaction) {
        guard !transactions.contains(where: { $0.id == transaction.id }) else { return }
        transactions = Self.sorted(transactions + [transaction])
    }

    func setBudget(name: String, amount: Int) async -> BudgetResult {
        let result = await saveBudgetGoal(api: api, categoryID: category.id, goalName: name, amount: amount)
        if result == .saved { budgetSaved = true }
        return result
    }
}

