import Foundation
import Observation
import SpendozaKit

/// The Categories screen: every category, with create, rename, class change, delete and (in a household) the
/// sharing switch. System defaults are listed but only custom categories can be edited or deleted, like the web.
@MainActor @Observable
final class CategoriesModel {
    private(set) var categories: [BudgetCategory] = []
    private(set) var isLoading = true
    private(set) var loadError: AreaError?
    /// The sharing switch's last failure.
    private(set) var shareError: AreaError?
    /// True once a create, rename, delete or sharing change succeeded, so the screens behind this one reload.
    private(set) var changed = false
    let inHousehold: Bool

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI
    private var shared: [String: Bool] = [:]
    /// Categories whose switch is being saved; each is held until its PUT returns so saves can't race.
    private var inFlight: Set<String> = []

    init(api: any SpendozaAPI, inHousehold: Bool) {
        self.api = api
        self.inHousehold = inHousehold
    }

    // MARK: Copy (the web's)

    static let classOptions: [(value: BudgetClass, title: String)] = [
        (.need, "Need (50%)"),
        (.want, "Want (30%)"),
        (.savings, "Savings (20%)"),
        (.transfer, "Transfer (not income or spending)"),
        (.other, "Other"),
    ]

    static let classHelp = "Used for 50/30/20 budget allocation tracking. Savings counts as saved, not spent; transfers between your own accounts and credit card payments count as neither income nor spending."
    static let sharedHelp = "Make this category visible to all household members"

    /// Mirrors the web's `categoryDeleteMessage`.
    static func deleteMessage(name: String) -> String {
        "Are you sure you want to delete “\(name)”? Its transactions become uncategorized and its bills move to Other."
    }

    static func title(for budgetClass: BudgetClass) -> String {
        classOptions.first { $0.value == budgetClass }?.title ?? "Other"
    }

    // MARK: What the screen shows

    func canEdit(_ category: BudgetCategory) -> Bool { !category.isSystemDefault }

    func isShared(_ id: String) -> Bool { shared[id] ?? false }

    /// True while that category's switch is being saved.
    func isUpdating(_ id: String) -> Bool { inFlight.contains(id) }

    // MARK: Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let all = try await api.categories()
            categories = Self.sorted(all)
            shared = Dictionary(all.map { ($0.id, $0.isSharedWithHousehold) }, uniquingKeysWith: { first, _ in first })
            loadError = nil
        } catch {
            if endsSession(error) { return }
            loadError = AreaError(error, fallback: "Failed to load categories")
        }
    }

    // MARK: Actions (each returns nil on success, otherwise the text to show)

    func create(name: String, budgetClass: BudgetClass, shared makeShared: Bool) async -> String? {
        guard let name = name.trimmedNonEmpty else { return nil }
        do {
            // The switch exists only for household members.
            let made = try await api.createCategory(name: name, budgetClass: budgetClass, shared: inHousehold && makeShared)
            categories = Self.sorted(categories + [made])
            shared[made.id] = made.isSharedWithHousehold
            changed = true
            return nil
        } catch {
            return endsSession(error) ? nil : message(for: error)
        }
    }

    func update(_ category: BudgetCategory, name: String, budgetClass: BudgetClass) async -> String? {
        guard let name = name.trimmedNonEmpty else { return nil }
        do {
            let saved = try await api.updateCategory(id: category.id, name: name, budgetClass: budgetClass)
            if let index = categories.firstIndex(where: { $0.id == category.id }) { categories[index] = saved }
            categories = Self.sorted(categories)
            changed = true
            return nil
        } catch {
            return endsSession(error) ? nil : message(for: error)
        }
    }

    func delete(_ category: BudgetCategory) async -> String? {
        do {
            try await api.deleteCategory(id: category.id)
            categories.removeAll { $0.id == category.id }
            shared[category.id] = nil
            changed = true
            return nil
        } catch {
            return endsSession(error) ? nil : message(for: error)
        }
    }

    /// Saves one switch at once (the same call as the Home tab's); if that fails the switch goes back and the error shows.
    func setShared(_ id: String, _ value: Bool) async {
        guard !inFlight.contains(id) else { return }
        inFlight.insert(id)
        defer { inFlight.remove(id) }
        let before = isShared(id)
        shared[id] = value
        shareError = nil
        do {
            try await api.setCategoryShared(id: id, shared: value)
            changed = true
        } catch {
            shared[id] = before
            if endsSession(error) { return }
            shareError = AreaError(error, fallback: "Failed to update category")
        }
    }

    // MARK: Helpers

    private static func sorted(_ list: [BudgetCategory]) -> [BudgetCategory] {
        list.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private func message(for error: Error) -> String {
        (error as? APIError)?.userMessage ?? "Failed to save category"
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
}

/// The category form's fields; a new category is a "want" like the web.
struct CategoryForm: Equatable {
    var name = ""
    var budgetClass = BudgetClass.want
    var shared = false

    init() {}

    init(editing category: BudgetCategory, shared: Bool) {
        name = category.name
        budgetClass = category.budgetClass
        self.shared = shared
    }

    var canSave: Bool { name.trimmedNonEmpty != nil }
}
