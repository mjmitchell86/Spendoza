import Observation
import SpendozaKit

/// The admin user list: a search and tier filter over the server's pages of 25, loaded one page at a time.
@Observable @MainActor
final class AdminUsersModel {
    var search = ""
    /// "free", "starter" or "pro"; nil is all tiers.
    var tier: String?

    private(set) var users: [AdminUser] = []
    private(set) var total = 0
    private(set) var loaded = false
    private(set) var loading = false
    /// The last failure, in words for the screen; cleared when the next load starts.
    private(set) var error: String?

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private var page = 1
    /// Bumped by every reload, so a slow answer to an older search can't overwrite a newer one.
    @ObservationIgnored private var generation = 0
    /// Set when a page came back empty although the total says there is more, so loading more can't loop.
    @ObservationIgnored private var exhausted = false

    init(api: any SpendozaAPI) { self.api = api }

    var canLoadMore: Bool { users.count < total && !exhausted }

    /// The search and tier the current list was loaded with, so `loadMore` stays on the same list while the
    /// fields are being edited.
    private struct Filter {
        let search: String?
        let tier: String?
    }

    @ObservationIgnored private var applied = Filter(search: nil, tier: nil)

    private func currentFilter() -> Filter {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return Filter(search: term.isEmpty ? nil : term, tier: tier)
    }

    private func query(_ filter: Filter, page: Int) -> AdminUserQuery {
        AdminUserQuery(page: page, search: filter.search, tier: filter.tier)
    }

    /// The search or tier was edited: waits `debounce` when only the typed text changed (so a burst of keys is
    /// one request), then reloads. Called from a task that SwiftUI cancels on the next edit; a cancelled call
    /// leaves no trace. Anything still in flight for the older filter is dropped at once.
    func filtersChanged(debounce: Duration = .milliseconds(300)) async {
        generation += 1
        if loaded, currentFilter().search != applied.search, currentFilter().tier == applied.tier {
            try? await Task.sleep(for: debounce)
        }
        guard !Task.isCancelled else { return }
        await reload()
    }

    /// Starts over at page 1 with the current search and tier.
    func reload() async {
        generation += 1
        let mine = generation
        let filter = currentFilter()
        error = nil
        loading = true
        defer { if mine == generation { loading = false } }
        do {
            let result = try await api.adminUsers(query(filter, page: 1))
            guard mine == generation, !Task.isCancelled else { return }
            applied = filter
            users = result.users
            total = result.total
            page = 1
            exhausted = false
            loaded = true
        } catch {
            guard mine == generation, !Task.isCancelled, !(error is CancellationError) else { return }
            self.error = Self.message(error)
        }
    }

    /// The next page of the list as it was loaded, appended; nothing once every user is listed.
    func loadMore() async {
        guard canLoadMore, !loading else { return }
        let mine = generation
        error = nil
        loading = true
        defer { if mine == generation { loading = false } }
        do {
            let result = try await api.adminUsers(query(applied, page: page + 1))
            guard mine == generation, !Task.isCancelled else { return }
            let known = Set(users.map(\.id))
            users += result.users.filter { !known.contains($0.id) }
            total = result.total
            page += 1
            if result.users.isEmpty { exhausted = true }
        } catch {
            guard mine == generation, !Task.isCancelled, !(error is CancellationError) else { return }
            self.error = Self.message(error)
        }
    }

    /// A row changed on its detail screen.
    func replace(_ user: AdminUser) {
        guard let index = users.firstIndex(where: { $0.id == user.id }) else { return }
        users[index] = user
    }

    /// A row deleted on its detail screen.
    func remove(id: String) {
        guard let index = users.firstIndex(where: { $0.id == id }) else { return }
        users.remove(at: index)
        total = max(0, total - 1)
    }

    private static func message(_ error: Error) -> String {
        (error as? APIError)?.userMessage ?? "Couldn't load users. Try again."
    }
}
