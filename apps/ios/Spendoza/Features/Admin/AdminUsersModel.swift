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

    private func query(page: Int) -> AdminUserQuery {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return AdminUserQuery(page: page, search: term.isEmpty ? nil : term, tier: tier)
    }

    /// Starts over at page 1 with the current search and tier.
    func reload() async {
        generation += 1
        let mine = generation
        error = nil
        loading = true
        defer { if mine == generation { loading = false } }
        do {
            let result = try await api.adminUsers(query(page: 1))
            guard mine == generation else { return }
            users = result.users
            total = result.total
            page = 1
            exhausted = false
            loaded = true
        } catch {
            guard mine == generation else { return }
            self.error = Self.message(error)
        }
    }

    /// The next page, appended; nothing once every user is listed.
    func loadMore() async {
        guard canLoadMore, !loading else { return }
        let mine = generation
        error = nil
        loading = true
        defer { if mine == generation { loading = false } }
        do {
            let result = try await api.adminUsers(query(page: page + 1))
            guard mine == generation else { return }
            let known = Set(users.map(\.id))
            users += result.users.filter { !known.contains($0.id) }
            total = result.total
            page += 1
            if result.users.isEmpty { exhausted = true }
        } catch {
            guard mine == generation else { return }
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
