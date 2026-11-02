import Foundation
import Observation
import SpendozaKit

/// One statement's review: its transactions with a category edit, and (for a shared account, in a household)
/// who each one belongs to, singly or in bulk.
@MainActor @Observable
final class StatementDetailModel {
    let statementID: String
    let poller: StatementPoller
    private(set) var transactions: [Transaction] = []
    private(set) var categories: [BudgetCategory] = []
    /// The household's members, empty outside a household.
    private(set) var members: [Member] = []
    private(set) var isLoading = true
    private(set) var loadError: String?
    /// Why the last category change or assignment failed.
    private(set) var actionError: String?
    /// Why one transaction could not be assigned (the server's words), by transaction id.
    private(set) var rowErrors: [String: String] = [:]
    private(set) var isAssigning = false
    private(set) var isSelecting = false
    private(set) var selected: Set<String> = []

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI

    init(api: any SpendozaAPI, statementID: String, poller: StatementPoller) {
        self.api = api
        self.statementID = statementID
        self.poller = poller
    }

    // MARK: What the screen shows

    /// The statement as the poller last saw it; nil once it was removed.
    var statement: Statement? { poller.statements.first { $0.id == statementID } }

    var row: StatementRow? { statement.map(StatementsModel.row) }

    /// "Transactions — Chase (October 2026)"
    var title: String {
        guard let row else { return "Statement" }
        return row.monthText == "Pending" ? "Transactions — \(row.title)" : "Transactions — \(row.title) (\(row.monthText))"
    }

    /// "Assign to" is offered for a shared account when you're in a household.
    var canAssign: Bool { (statement?.isShared ?? false) && !members.isEmpty }

    /// The name of the member a transaction is assigned to; nil when unassigned.
    func assignee(of transaction: Transaction) -> String? {
        guard let id = transaction.attributedTo else { return nil }
        return members.first { $0.id == id }?.displayName ?? "Household member"
    }

    var selectedCount: Int { selected.count }

    /// The transactions grouped by day, newest day first.
    var days: [TransactionsModel.Day] {
        var out: [TransactionsModel.Day] = []
        for transaction in transactions {
            if let last = out.last, last.date == transaction.date {
                out[out.count - 1] = .init(date: last.date, title: last.title, transactions: last.transactions + [transaction])
            } else {
                out.append(.init(date: transaction.date, title: shortDate(transaction.date), transactions: [transaction]))
            }
        }
        return out
    }

    func pickerTargets(for transaction: Transaction) -> [BudgetCategory] {
        categories.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            .filter { $0.name != transaction.category }
    }

    func offersUncategorized(for transaction: Transaction) -> Bool { transaction.category != nil }

    // MARK: Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        let api = self.api, id = statementID
        async let list = Self.capture { try await api.transactions(statementID: id) }
        async let categoryList = Self.capture { try await api.categories() }
        async let household = Self.capture { try await api.household() }
        // The categories and members only serve the edits; the transactions are the screen.
        if case .success(let found) = await categoryList { categories = found }
        if case .success(let found) = await household {
            members = (found?.members ?? []).sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        }
        switch await list {
        case .success(let found):
            transactions = found.sorted { $0.date > $1.date }
            loadError = nil
        case .failure(let error):
            if endsSession(error) { return }
            loadError = (error as? APIError)?.userMessage ?? "Failed to load transactions"
        }
    }

    // MARK: Category

    /// Moves a transaction to another category (nil is Uncategorized): at once, and back with an error if the call fails.
    func recategorize(_ transaction: Transaction, to name: String?) async {
        guard let index = transactions.firstIndex(where: { $0.id == transaction.id }) else { return }
        actionError = nil
        let before = transactions[index]
        transactions[index] = Self.with(before, category: .some(name))
        do {
            try await api.setCategory(transactionID: transaction.id, category: name)
        } catch {
            if let back = transactions.firstIndex(where: { $0.id == transaction.id }) { transactions[back] = before }
            if !endsSession(error) { actionError = (error as? APIError)?.userMessage ?? "Couldn't change the category. Try again." }
        }
    }

    // MARK: Assign

    /// Assigns one transaction to a member: it shows at once and goes back with the server's words if refused.
    func assign(_ transaction: Transaction, to member: Member) async {
        guard let index = transactions.firstIndex(where: { $0.id == transaction.id }) else { return }
        actionError = nil
        rowErrors[transaction.id] = nil
        let before = transactions[index]
        transactions[index] = Self.with(before, attributedTo: member.id)
        do {
            try await api.attribute(transactionID: transaction.id, to: member.id)
        } catch {
            if let back = transactions.firstIndex(where: { $0.id == transaction.id }) { transactions[back] = before }
            if !endsSession(error) { rowErrors[transaction.id] = (error as? APIError)?.userMessage ?? APIClient.genericErrorMessage }
        }
    }

    func startSelecting() { isSelecting = true }

    func stopSelecting() {
        isSelecting = false
        selected = []
    }

    func toggle(_ transaction: Transaction) {
        if selected.contains(transaction.id) { selected.remove(transaction.id) } else { selected.insert(transaction.id) }
    }

    func selectAll() { selected = Set(transactions.map(\.id)) }

    func deselectAll() { selected = [] }

    /// Assigns every selected transaction to `member`. Each one that saved leaves the selection; each one that
    /// didn't stays selected and shows the server's words.
    func assignSelected(to member: Member) async {
        let ids = transactions.map(\.id).filter(selected.contains)
        guard !ids.isEmpty else { return }
        actionError = nil
        isAssigning = true
        defer { isAssigning = false }
        for id in ids { rowErrors[id] = nil }
        do {
            let results = try await api.bulkAttribute(ids.map { ($0, member.id) })
            var failed = 0
            for id in ids {
                // An id with no answer counts as failed (the client already fills in the generic words).
                let error = results[id] ?? .some(APIClient.genericErrorMessage)
                if let text = error {
                    rowErrors[id] = text
                    failed += 1
                } else if let index = transactions.firstIndex(where: { $0.id == id }) {
                    transactions[index] = Self.with(transactions[index], attributedTo: member.id)
                    selected.remove(id)
                }
            }
            if failed > 0 { actionError = failed == 1 ? "1 transaction couldn't be assigned." : "\(failed) transactions couldn't be assigned." }
            if failed == 0 { stopSelecting() }
        } catch {
            if !endsSession(error) { actionError = (error as? APIError)?.userMessage ?? APIClient.genericErrorMessage }
        }
    }

    // MARK: Helpers

    private static func with(_ t: Transaction, category: String?? = nil, attributedTo: String? = nil) -> Transaction {
        Transaction(id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type,
                    category: category ?? t.category, statementID: t.statementID, attributedTo: attributedTo ?? t.attributedTo)
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
