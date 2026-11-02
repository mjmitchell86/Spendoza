import Foundation
import Observation
import SpendozaKit

/// The Bills segment's recurring income: every entry you own or that is attributed to you, newest effective date
/// first (the server's order). Not month-scoped.
@MainActor @Observable
final class IncomeModel {
    /// One line of the list, with its words already worked out.
    struct Row: Identifiable, Equatable {
        let id: String
        /// The friendly name, or the source name when there is none.
        let title: String
        /// The raw source name, shown beneath a friendly name.
        let rawSourceName: String?
        let amountText: String
        /// "Auto-detected", "AI suggested", then the attributed member or custom name.
        let marks: [String]
        let frequencyLabel: String
        let effectiveText: String
    }

    private(set) var entries: [IncomeEntry] = []
    /// The household's members, empty outside a household.
    private(set) var members: [Member] = []
    private(set) var isLoading = true
    private(set) var loadError: String?

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI
    /// Read at each use: the signed-in profile can change after this model was made.
    @ObservationIgnored private let selfID: @MainActor () -> String?
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private let now: () -> Date

    init(api: any SpendozaAPI, selfID: @escaping @MainActor () -> String?, calendar: Calendar = .current,
         now: @escaping () -> Date = { .now }) {
        self.api = api
        self.selfID = selfID
        self.calendar = calendar
        self.now = now
    }

    // MARK: What the screen shows

    var today: Date { calendar.startOfDay(for: now()) }

    var rows: [Row] {
        let formatter = ExpensesModel.dueFormatter(calendar)
        return entries.map { entry in
            let friendly = entry.friendlyName.trimmedNonEmpty
            var marks: [String] = []
            if entry.autoDetected { marks.append("Auto-detected") }
            if entry.aiSuggested { marks.append("AI suggested") }
            if let who = attribution(of: entry) { marks.append(who) }
            return Row(id: entry.id, title: friendly ?? entry.sourceName, rawSourceName: friendly == nil ? nil : entry.sourceName,
                       amountText: Money.cents(entry.amount), marks: marks, frequencyLabel: Self.label(entry.frequency),
                       effectiveText: formatter.string(from: entry.effectiveDate))
        }
    }

    /// The member's name or the custom name the entry is attributed to; nil when it is simply the owner's.
    private func attribution(of entry: IncomeEntry) -> String? {
        if let id = entry.attributedToUserID {
            return members.first { $0.id == id }?.displayName ?? "Household member"
        }
        return entry.attributedToName.trimmedNonEmpty
    }

    /// "Me (default)", then "Household member" when in a household, then "Custom name".
    var attributionChoices: [IncomeForm.Attribution] {
        members.isEmpty ? [.me, .custom] : [.me, .member, .custom]
    }

    /// Only the owner deletes; someone an entry is attributed to can edit it but not delete it.
    func canDelete(_ entry: IncomeEntry) -> Bool { entry.ownerID == selfID() }

    static func label(_ frequency: IncomeFrequency) -> String {
        switch frequency {
        case .oneTime: "One-time"
        case .weekly: "Weekly"
        case .biweekly: "Biweekly"
        case .monthly: "Monthly"
        case .annually: "Annually"
        }
    }

    static func deleteMessage(for entry: IncomeEntry) -> String {
        "Are you sure you want to delete \"\(entry.sourceName)\"? This action cannot be undone."
    }

    // MARK: Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        let api = self.api
        async let household = Self.capture { try await api.household() }
        async let list = Self.capture { try await api.incomeEntries() }
        // The household only names the attribution choices; the entries are the screen.
        if case .success(let found) = await household {
            members = (found?.members ?? []).sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        }
        switch await list {
        case .success(let loaded):
            entries = loaded
            loadError = nil
        case .failure(let error):
            if endsSession(error) { return }
            loadError = userMessage(for: error)
        }
    }

    // MARK: Actions

    /// Creates the entry (`id` nil) or updates it. Returns nil on success, otherwise the text to show.
    func save(_ draft: IncomeDraft, id: String?) async -> String? {
        do {
            let saved = try await api.saveIncome(draft, id: id)
            if let index = entries.firstIndex(where: { $0.id == saved.id }) { entries[index] = saved } else { entries.insert(saved, at: 0) }
            return nil
        } catch {
            return endsSession(error) ? nil : userMessage(for: error)
        }
    }

    /// Deletes the entry. Returns nil on success, otherwise the server's text.
    func delete(_ entry: IncomeEntry) async -> String? {
        do {
            try await api.deleteIncome(id: entry.id)
            entries.removeAll { $0.id == entry.id }
            return nil
        } catch {
            return endsSession(error) ? nil : userMessage(for: error)
        }
    }

    // MARK: Helpers

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

/// The add/edit form's fields. `draft()` is nil until the source name, an amount above zero and, for a chosen
/// member or custom name, who it is, are filled in.
struct IncomeForm: Equatable {
    enum Attribution: Equatable {
        case me, member, custom

        var title: String {
            switch self {
            case .me: "Me (default)"
            case .member: "Household member"
            case .custom: "Custom name"
            }
        }
    }

    var sourceName = ""
    var friendlyName = ""
    var amountText = ""
    var frequency = IncomeFrequency.monthly
    var effectiveDate: Date
    var hasEndDate = false
    var endDate: Date
    var attribution = Attribution.me
    var memberID: String?
    var customName = ""
    /// How the amount is typed and shown.
    let locale: Locale

    /// A new entry: monthly, effective today, attributed to you (like the web).
    init(today: Date, locale: Locale = .current) {
        self.locale = locale
        effectiveDate = today
        endDate = today
    }

    init(editing entry: IncomeEntry, locale: Locale = .current) {
        self.locale = locale
        sourceName = entry.sourceName
        friendlyName = entry.friendlyName ?? ""
        amountText = AmountText.format(entry.amount, locale: locale)
        frequency = entry.frequency
        effectiveDate = entry.effectiveDate
        hasEndDate = entry.endDate != nil
        endDate = entry.endDate ?? entry.effectiveDate
        if let id = entry.attributedToUserID {
            attribution = .member
            memberID = id
        } else if let name = entry.attributedToName.trimmedNonEmpty {
            attribution = .custom
            customName = name
        }
    }

    var amount: Double? {
        guard let value = AmountText.parse(amountText, locale: locale), value > 0 else { return nil }
        return value
    }

    var canSave: Bool { draft() != nil }

    /// Only the chosen attribution is set; "Me (default)" sends both as nulls so an edit clears the old one.
    func draft() -> IncomeDraft? {
        guard let source = sourceName.trimmedNonEmpty, let amount else { return nil }
        var userID: String?
        var name: String?
        switch attribution {
        case .me: break
        case .member:
            guard let memberID else { return nil }
            userID = memberID
        case .custom:
            guard let custom = customName.trimmedNonEmpty else { return nil }
            name = custom
        }
        return IncomeDraft(sourceName: source, friendlyName: friendlyName.trimmedNonEmpty, amount: amount, frequency: frequency,
                           effectiveDate: effectiveDate, endDate: hasEndDate ? endDate : nil, attributedToUserID: userID,
                           attributedToName: name)
    }
}
