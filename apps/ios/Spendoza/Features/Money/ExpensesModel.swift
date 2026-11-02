import Foundation
import Observation
import SpendozaKit

/// The Bills segment's recurring expenses: every bill (one-time ones too, like the web), soonest due first, with the
/// web's type and category filters. Bills are not month-scoped.
@MainActor @Observable
final class ExpensesModel {
    enum TypeFilter: String, CaseIterable, Identifiable {
        case all = "All types", oneTime = "One-time", recurring = "Recurring"
        var id: String { rawValue }
    }

    /// One line of the list, with its words already worked out.
    struct Row: Identifiable, Equatable {
        let id: String
        /// The friendly name, or the description when there is none.
        let title: String
        /// The raw description, shown beneath a friendly name.
        let rawDescription: String?
        let amountText: String
        /// The amount before the AI adjusted it (shown struck through); nil when not adjusted.
        let originalAmountText: String?
        let isAuto: Bool
        let isAIAdjusted: Bool
        let categoryName: String
        let frequencyLabel: String
        let dueText: String
    }

    private(set) var expenses: [Expense] = []
    private(set) var categories: [BudgetCategory] = []
    private(set) var isLoading = true
    private(set) var loadError: String?

    var filter = TypeFilter.all
    /// A category id; nil shows every category.
    var category: String?

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private let now: () -> Date

    init(api: any SpendozaAPI, calendar: Calendar = .current, now: @escaping () -> Date = { .now }) {
        self.api = api
        self.calendar = calendar
        self.now = now
    }

    // MARK: What the screen shows

    var today: Date { calendar.startOfDay(for: now()) }

    var isFiltering: Bool { filter != .all || category != nil }

    var visible: [Expense] {
        expenses.filter { bill in
            switch filter {
            case .all: break
            case .oneTime: if bill.frequency != .oneTime { return false }
            case .recurring: if bill.frequency != .recurring { return false }
            }
            return category == nil || bill.categoryID == category
        }
    }

    var rows: [Row] {
        let formatter = Self.dueFormatter(calendar)
        return visible.map { bill in
            let friendly = bill.friendlyName.trimmedNonEmpty
            return Row(id: bill.id, title: Self.displayName(bill), rawDescription: friendly == nil ? nil : bill.description,
                       amountText: Money.cents(bill.amount),
                       originalAmountText: bill.isAIAdjusted ? bill.originalAmount.map(Money.cents) : nil,
                       isAuto: bill.autoDetected, isAIAdjusted: bill.isAIAdjusted, categoryName: categoryName(for: bill.categoryID),
                       frequencyLabel: Self.frequencyLabel(bill), dueText: formatter.string(from: bill.nextDueDate))
        }
    }

    /// Categories by name, for the filter and the form.
    var categoryChoices: [BudgetCategory] {
        categories.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    func categoryName(for id: String) -> String {
        categories.first { $0.id == id }?.name ?? "Unknown"
    }

    static func displayName(_ bill: Expense) -> String { bill.friendlyName.trimmedNonEmpty ?? bill.description }

    /// "Weekly", "Biweekly", "Monthly", "Quarterly", "Annually" or "One-time".
    static func frequencyLabel(_ bill: Expense) -> String {
        guard bill.frequency == .recurring else { return "One-time" }
        return bill.interval.map(label) ?? "Recurring"
    }

    static func label(_ interval: RecurrenceInterval) -> String {
        switch interval {
        case .weekly: "Weekly"
        case .biweekly: "Biweekly"
        case .monthly: "Monthly"
        case .quarterly: "Quarterly"
        case .annually: "Annually"
        }
    }

    static func deleteMessage(for bill: Expense) -> String {
        "Are you sure you want to delete \"\(displayName(bill))\"? This action cannot be undone."
    }

    // MARK: Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        let api = self.api
        async let categoryList = Self.capture { try await api.categories() }
        async let billList = Self.capture { try await api.expenses() }
        // The category list names and filters the bills; the bills are the screen.
        if case .success(let list) = await categoryList { categories = list }
        switch await billList {
        case .success(let list):
            expenses = Self.sorted(list)
            loadError = nil
        case .failure(let error):
            if endsSession(error) { return }
            loadError = userMessage(for: error)
        }
    }

    // MARK: Actions

    /// Creates the bill (`id` nil) or updates it. Returns nil on success, otherwise the text to show.
    func save(_ draft: ExpenseDraft, id: String?) async -> String? {
        do {
            let saved = try await api.saveExpense(draft, id: id)
            if let index = expenses.firstIndex(where: { $0.id == saved.id }) { expenses[index] = saved } else { expenses.append(saved) }
            expenses = Self.sorted(expenses)
            return nil
        } catch {
            return endsSession(error) ? nil : userMessage(for: error)
        }
    }

    /// Deletes the bill. Returns nil on success, otherwise the server's text (the web swallowed it).
    func delete(_ bill: Expense) async -> String? {
        do {
            try await api.deleteExpense(id: bill.id)
            expenses.removeAll { $0.id == bill.id }
            return nil
        } catch {
            return endsSession(error) ? nil : userMessage(for: error)
        }
    }

    // MARK: Helpers

    /// Soonest due first, keeping the server's order for the same day.
    private static func sorted(_ list: [Expense]) -> [Expense] {
        list.enumerated().sorted { a, b in
            a.element.nextDueDate != b.element.nextDueDate ? a.element.nextDueDate < b.element.nextDueDate : a.offset < b.offset
        }.map(\.element)
    }

    /// "Nov 20, 2026"
    static func dueFormatter(_ calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "MMM d, yyyy"
        return formatter
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

extension Optional where Wrapped == String {
    /// nil when missing or only whitespace; otherwise the trimmed text.
    var trimmedNonEmpty: String? { self?.trimmedNonEmpty }
}

extension String {
    var trimmedNonEmpty: String? {
        let text = trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }
}

/// The add/edit form's fields. `draft()` is nil until description, amount (above zero) and category are filled in.
struct ExpenseForm: Equatable {
    var description = ""
    var friendlyName = ""
    var amountText = ""
    var categoryID: String?
    var frequency = ExpenseFrequency.oneTime
    var interval = RecurrenceInterval.monthly
    var nextDueDate: Date
    var hasEndDate = false
    var endDate: Date
    /// How the amount is typed and shown.
    let locale: Locale

    /// A new bill: one-time, due today (like the web).
    init(today: Date, locale: Locale = .current) {
        self.locale = locale
        nextDueDate = today
        endDate = today
    }

    init(editing bill: Expense, locale: Locale = .current) {
        self.locale = locale
        description = bill.description
        friendlyName = bill.friendlyName ?? ""
        amountText = AmountText.format(bill.amount, locale: locale)
        categoryID = bill.categoryID
        frequency = bill.frequency
        interval = bill.interval ?? .monthly
        nextDueDate = bill.nextDueDate
        hasEndDate = bill.endDate != nil
        endDate = bill.endDate ?? bill.nextDueDate
    }

    var amount: Double? {
        guard let value = AmountText.parse(amountText, locale: locale), value > 0 else { return nil }
        return value
    }

    var canSave: Bool { draft() != nil }

    func draft() -> ExpenseDraft? {
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let amount, let categoryID else { return nil }
        return ExpenseDraft(categoryID: categoryID, description: text, friendlyName: friendlyName.trimmedNonEmpty, amount: amount,
                            frequency: frequency, interval: frequency == .recurring ? interval : nil, nextDueDate: nextDueDate,
                            endDate: hasEndDate ? endDate : nil)
    }
}
