import Foundation
import Observation
import SpendozaKit

/// How you share income and expenses with your household, and (when sharing by category) which categories.
@Observable @MainActor
final class SharingSettingsModel {
    enum Message: Equatable {
        case saved
        case plan
        case failed(String)
    }

    var income: IncomeSharing = .all
    var expense: ExpenseSharing = .all
    var amountText = ""
    private(set) var categories: [BudgetCategory] = []
    private var shared: [String: Bool] = [:]
    private(set) var loaded = false
    private(set) var saving = false
    private(set) var message: Message?
    private(set) var categoryError: AreaError?
    private(set) var loadError: String?

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let reload: @MainActor () async -> Void
    @ObservationIgnored private var categoriesLoaded = false
    /// Numbers in the amount field are read and written the way the device's keyboard types them.
    @ObservationIgnored private let locale: Locale
    /// Categories whose switch is being saved; each is held until its PUT returns so saves can't race.
    private var inFlight: Set<String> = []

    init(api: any SpendozaAPI, locale: Locale = .current, reload: @escaping @MainActor () async -> Void) {
        self.api = api
        self.locale = locale
        self.reload = reload
    }

    private var numberFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter
    }

    /// Prefills from the profile (the amount lives only there).
    func load() async {
        do {
            let profile = try await api.profile()
            income = profile.incomeSharing
            expense = profile.expenseSharing
            amountText = profile.sharedIncomeAmount.flatMap { numberFormatter.string(from: NSNumber(value: $0)) } ?? ""
            loaded = true
            loadError = nil
        } catch {
            loadError = (error as? APIError)?.userMessage ?? "Failed to load sharing preferences"
            return
        }
        await loadCategoriesIfNeeded()
    }

    var showsCategories: Bool { expense == .category }

    func loadCategoriesIfNeeded() async {
        guard showsCategories, !categoriesLoaded else { return }
        do {
            let all = try await api.categories()
            categories = all.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            shared = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0.isSharedWithHousehold) })
            categoriesLoaded = true
            categoryError = nil
        } catch {
            categoryError = AreaError(error, fallback: "Failed to load categories")
        }
    }

    func isShared(_ id: String) -> Bool { shared[id] ?? false }

    /// Saves one category switch at once; if that fails the switch goes back and the error shows.
    func setShared(_ id: String, _ value: Bool) async {
        guard !inFlight.contains(id) else { return }
        inFlight.insert(id)
        defer { inFlight.remove(id) }
        let before = isShared(id)
        shared[id] = value
        categoryError = nil
        do {
            try await api.setCategoryShared(id: id, shared: value)
        } catch {
            shared[id] = before
            categoryError = AreaError(error, fallback: "Failed to update category")
        }
    }

    /// True while that category's switch is being saved.
    func isUpdating(_ id: String) -> Bool { inFlight.contains(id) }

    private var amount: Double? {
        let text = amountText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = numberFormatter.number(from: text)?.doubleValue, value.isFinite else { return nil }
        return value
    }

    /// A partial income share needs an amount above zero.
    var canSave: Bool {
        guard !saving else { return false }
        return income != .partial || (amount ?? 0) > 0
    }

    func save() async {
        guard canSave else { return }
        saving = true
        message = nil
        defer { saving = false }
        do {
            try await api.updateSharing(SharingChange(income: income,
                                                      sharedIncomeAmount: income == .partial ? amount : nil,
                                                      expense: expense))
            message = .saved
        } catch {
            switch AreaError(error, fallback: "Failed to update sharing") {
            case .plan: message = .plan
            case .message(let text): message = .failed(text)
            }
            return
        }
        await reload()
    }

    /// Editing anything takes the last result off the screen.
    func clearMessage() { message = nil }
}
