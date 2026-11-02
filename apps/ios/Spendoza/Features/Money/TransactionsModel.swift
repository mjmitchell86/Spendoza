import Foundation
import Observation
import SpendozaKit

/// The Transactions segment for one month: every transaction, searchable and filterable by type and category, with
/// a tap-to-recategorize that shows at once and comes back if the call fails.
@MainActor @Observable
final class TransactionsModel {
    enum TypeFilter: String, CaseIterable, Identifiable {
        case all = "All types", credit = "Credits", debit = "Debits"
        var id: String { rawValue }
    }

    struct Move: Equatable {
        let transaction: Transaction
        /// The category before the move; nil means it was Uncategorized.
        let from: String?
        let to: String?
        var destination: String { to ?? TransactionsModel.uncategorized }
    }

    struct Day: Identifiable {
        let date: String
        let title: String
        let transactions: [Transaction]
        var id: String { date }
    }

    /// The category filter's value for transactions without a category.
    nonisolated static let uncategorized = "Uncategorized"

    let month: Month
    private(set) var all: [Transaction] = []
    private(set) var categories: [BudgetCategory] = []
    private(set) var isLoading = true
    private(set) var loadError: String?
    /// Why the last recategorize (or undo) failed.
    private(set) var actionError: String?
    /// The last successful move, for the Undo bar.
    private(set) var lastMove: Move?

    var search = ""
    var type = TypeFilter.all
    /// nil shows every category; `uncategorized` shows the ones without.
    var category: String?

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let calendar: Calendar

    init(api: any SpendozaAPI, month: Month, calendar: Calendar = .current) {
        self.api = api
        self.month = month
        self.calendar = calendar
    }

    // MARK: What the screen shows

    var visible: [Transaction] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return all.filter { transaction in
            if !query.isEmpty, !transaction.description.localizedCaseInsensitiveContains(query) { return false }
            switch type {
            case .all: break
            case .credit: if transaction.type != .credit { return false }
            case .debit: if transaction.type != .debit { return false }
            }
            switch category {
            case nil: return true
            case Self.uncategorized?: return transaction.category == nil
            case let name?: return transaction.category == name
            }
        }
    }

    /// The visible transactions grouped by day, newest day first.
    var days: [Day] {
        var out: [Day] = []
        for transaction in visible {
            if let last = out.last, last.date == transaction.date {
                out[out.count - 1] = Day(date: last.date, title: last.title, transactions: last.transactions + [transaction])
            } else {
                out.append(Day(date: transaction.date, title: shortDate(transaction.date), transactions: [transaction]))
            }
        }
        return out
    }

    /// The categories to pick from, by name.
    var categoryChoices: [BudgetCategory] {
        categories.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// The categories a transaction can move to: all but the one it is in.
    func pickerTargets(for transaction: Transaction) -> [BudgetCategory] {
        categoryChoices.filter { $0.name != transaction.category }
    }

    /// Whether the picker offers Uncategorized (not when the transaction already is).
    func offersUncategorized(for transaction: Transaction) -> Bool { transaction.category != nil }

    /// "+$2,400.00" for a credit, "−$212.40" for a debit (a true minus sign).
    static func amountText(_ transaction: Transaction) -> String {
        let text = Money.cents(transaction.amount)
        return transaction.type == .credit ? "+\(text)" : "−\(text)"
    }

    // MARK: Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        let (start, end) = monthBounds()
        let api = self.api
        async let categoryList = Self.capture { try await api.categories() }
        async let transactionList = Self.capture { try await api.transactions(from: start, to: end) }
        // The category list is only for the filter and picker; the transactions are the screen.
        if case .success(let list) = await categoryList { categories = list }
        switch await transactionList {
        case .success(let list):
            all = Self.sorted(list)
            loadError = nil
        case .failure(let error):
            if endsSession(error) { return }
            loadError = userMessage(for: error)
        }
    }

    // MARK: Actions

    /// Moves a transaction to another category (nil is Uncategorized): it changes at once and goes back with an
    /// error if the call fails.
    func recategorize(_ transaction: Transaction, to name: String?) async {
        guard let index = all.firstIndex(where: { $0.id == transaction.id }) else { return }
        actionError = nil
        let before = all[index]
        all[index] = Self.with(before, category: name)
        do {
            try await api.setCategory(transactionID: transaction.id, category: name)
            lastMove = Move(transaction: before, from: before.category, to: name)
        } catch {
            if let back = all.firstIndex(where: { $0.id == transaction.id }) { all[back] = before }
            if !endsSession(error) { actionError = userMessage(for: error) }
        }
    }

    /// Puts the last moved transaction back in its old category.
    func undo() async {
        guard let move = lastMove, let index = all.firstIndex(where: { $0.id == move.transaction.id }) else { return }
        actionError = nil
        lastMove = nil
        let moved = all[index]
        all[index] = Self.with(moved, category: move.from)
        do {
            try await api.setCategory(transactionID: move.transaction.id, category: move.from)
        } catch {
            if let back = all.firstIndex(where: { $0.id == move.transaction.id }) { all[back] = moved }
            lastMove = move
            if !endsSession(error) { actionError = userMessage(for: error) }
        }
    }

    func dismissMove() { lastMove = nil }

    // MARK: Helpers

    private static func with(_ t: Transaction, category: String?) -> Transaction {
        Transaction(id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type,
                    category: category, statementID: t.statementID, attributedTo: t.attributedTo)
    }

    private func monthBounds() -> (Date, Date) {
        let first = calendar.date(from: DateComponents(year: month.year, month: month.month, day: 1, hour: 12)) ?? .now
        let days = calendar.range(of: .day, in: .month, for: first)?.count ?? 28
        let last = calendar.date(from: DateComponents(year: month.year, month: month.month, day: days, hour: 12)) ?? first
        return (first, last)
    }

    /// Newest first, keeping the server's order within a day.
    private static func sorted(_ list: [Transaction]) -> [Transaction] {
        list.enumerated().sorted { a, b in
            a.element.date != b.element.date ? a.element.date > b.element.date : a.offset < b.offset
        }.map(\.element)
    }

    private func endsSession(_ error: Error) -> Bool {
        switch error as? APIError {
        case .unauthorized:
            onSessionEnded?()
            return true
        case .accountDisabled(let text):
            onAccountDisabled?(text)
            return true
        default:
            return false
        }
    }

    private static func capture<T: Sendable>(_ body: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await body()) } catch { return .failure(error) }
    }
}
