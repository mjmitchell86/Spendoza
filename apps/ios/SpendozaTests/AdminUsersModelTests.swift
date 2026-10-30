import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct AdminUsersModelTests {
    static func user(_ id: String, _ name: String = "Ann", tier: String = "free") -> AdminUser {
        AdminUser(id: id, displayName: name, email: "\(id)@example.com", tier: tier, isAdmin: false, disabled: false,
                  createdAt: Date(timeIntervalSince1970: 1_790_000_000))
    }

    private func page(_ ids: ClosedRange<Int>, total: Int, number: Int = 1) -> AdminUserPage {
        AdminUserPage(users: ids.map { Self.user("u\($0)") }, total: total, page: number, limit: 25)
    }

    @Test func reloadQueriesPageOneWithSearchAndTier() async {
        let api = StubAPI()
        api.adminUsersResult = .success(page(1...2, total: 2))
        let m = AdminUsersModel(api: api)
        m.search = "ann"
        m.tier = "pro"
        await m.reload()
        #expect(api.calls == ["adminUsers(page: 1, search: ann, tier: pro)"])
        #expect(m.users.map(\.id) == ["u1", "u2"])
        #expect(m.total == 2)
        #expect(m.loaded)
    }

    @Test func emptySearchAndNoTierLeaveBothOut() async {
        let api = StubAPI()
        let m = AdminUsersModel(api: api)
        m.search = "  "
        await m.reload()
        #expect(api.calls == ["adminUsers(page: 1, search: nil, tier: nil)"])
    }

    @Test func loadMoreAsksTheNextPageAppendsAndStopsAtTheTotal() async {
        let api = StubAPI()
        api.adminUsersPages = [1: page(1...25, total: 30), 2: page(26...30, total: 30, number: 2)]
        let m = AdminUsersModel(api: api)
        await m.reload()
        #expect(m.canLoadMore)
        await m.loadMore()
        #expect(api.calls.last == "adminUsers(page: 2, search: nil, tier: nil)")
        #expect(m.users.count == 30)
        #expect(m.users.last?.id == "u30")
        #expect(!m.canLoadMore)
        await m.loadMore()
        #expect(api.calls.count == 2)
    }

    @Test func changingTheSearchStartsOverAtPageOne() async {
        let api = StubAPI()
        api.adminUsersPages = [1: page(1...25, total: 30), 2: page(26...30, total: 30, number: 2)]
        let m = AdminUsersModel(api: api)
        await m.reload()
        await m.loadMore()
        m.search = "bo"
        api.adminUsersPages = [1: page(40...40, total: 1)]
        await m.reload()
        #expect(api.calls.last == "adminUsers(page: 1, search: bo, tier: nil)")
        #expect(m.users.map(\.id) == ["u40"])
        #expect(m.total == 1)
        #expect(!m.canLoadMore)
    }

    @Test func aFailedLoadShowsTheMessageAndKeepsTheList() async {
        let api = StubAPI()
        api.adminUsersResult = .success(page(1...2, total: 2))
        let m = AdminUsersModel(api: api)
        await m.reload()
        api.adminUsersResult = .failure(.message("Admin access required"))
        await m.reload()
        #expect(m.error == "Admin access required")
        #expect(m.users.count == 2)
    }

    @Test func replaceSwapsTheRowAndRemoveDropsItAndTheTotal() async {
        let api = StubAPI()
        api.adminUsersResult = .success(page(1...3, total: 3))
        let m = AdminUsersModel(api: api)
        await m.reload()
        m.replace(Self.user("u2", "Ann", tier: "pro"))
        #expect(m.users[1].tier == "pro")
        m.remove(id: "u1")
        #expect(m.users.map(\.id) == ["u2", "u3"])
        #expect(m.total == 2)
    }

    // MARK: Races and failures

    /// Holds a call until `open()`.
    actor Gate {
        private var continuation: CheckedContinuation<Void, Never>?
        private var isOpen = false
        func wait() async {
            if isOpen { return }
            await withCheckedContinuation { continuation = $0 }
        }
        func open() {
            isOpen = true
            continuation?.resume()
            continuation = nil
        }
    }

    private func waitForCalls(_ api: StubAPI, _ count: Int) async {
        for _ in 0..<1000 where api.calls.count < count { await Task.yield() }
    }

    @Test func aSlowOlderSearchCannotOverwriteANewerOne() async {
        let api = StubAPI()
        let gate = Gate()
        let old = page(1...3, total: 3)
        let new = page(9...9, total: 1)
        api.adminUsersHook = { q in
            if q.search == "an" { await gate.wait(); return old }
            return new
        }
        let m = AdminUsersModel(api: api)
        m.search = "an"
        let first = Task { await m.reload() }
        await waitForCalls(api, 1)
        m.search = "ann"
        await m.reload()
        await gate.open()
        await first.value
        #expect(m.users.map(\.id) == ["u9"])
        #expect(m.total == 1)
        #expect(!m.loading)
    }

    @Test func loadMoreFailureKeepsTheListAndCanBeRetried() async {
        let api = StubAPI()
        api.adminUsersPages = [1: page(1...25, total: 30)]
        let m = AdminUsersModel(api: api)
        await m.reload()
        api.adminUsersHook = { _ in throw APIError.offline }
        await m.loadMore()
        #expect(m.error == APIError.offline.userMessage)
        #expect(m.users.count == 25)
        #expect(m.canLoadMore)
        api.adminUsersHook = nil
        api.adminUsersPages[2] = page(26...30, total: 30, number: 2)
        await m.loadMore()
        #expect(m.error == nil)
        #expect(m.users.count == 30)
    }

    @Test func loadMoreSkipsUsersAlreadyListed() async {
        let api = StubAPI()
        api.adminUsersPages = [1: page(1...25, total: 30), 2: page(24...30, total: 30, number: 2)]
        let m = AdminUsersModel(api: api)
        await m.reload()
        await m.loadMore()
        #expect(m.users.map(\.id) == (1...30).map { "u\($0)" })
    }

    @Test func anEmptyPageStopsLoadMoreFromLooping() async {
        let api = StubAPI()
        api.adminUsersPages = [1: page(1...25, total: 30), 2: AdminUserPage(users: [], total: 30, page: 2, limit: 25)]
        let m = AdminUsersModel(api: api)
        await m.reload()
        await m.loadMore()
        #expect(!m.canLoadMore)
        await m.loadMore()
        #expect(api.calls.count == 2)
    }

    @Test func aReloadDuringLoadMoreWins() async {
        let api = StubAPI()
        let gate = Gate()
        api.adminUsersPages = [1: page(1...25, total: 30)]
        let m = AdminUsersModel(api: api)
        await m.reload()
        let second = page(26...30, total: 30, number: 2)
        let fresh = page(50...50, total: 1)
        api.adminUsersHook = { q in
            if q.page == 2 { await gate.wait(); return second }
            return fresh
        }
        let more = Task { await m.loadMore() }
        await waitForCalls(api, 2)
        await m.reload()
        await gate.open()
        await more.value
        #expect(m.users.map(\.id) == ["u50"])
        #expect(m.total == 1)
        #expect(!m.loading)
    }

    @Test func loadMoreKeepsTheFilterTheListWasLoadedWith() async {
        let api = StubAPI()
        api.adminUsersPages = [1: page(1...25, total: 30), 2: page(26...30, total: 30, number: 2)]
        let m = AdminUsersModel(api: api)
        m.search = "ann"
        await m.reload()
        m.search = "bob"
        await m.loadMore()
        #expect(api.calls.last == "adminUsers(page: 2, search: ann, tier: nil)")
    }

    @Test func aCancelledReloadLeavesNoErrorAndNoStaleData() async {
        let api = StubAPI()
        let gate = Gate()
        api.adminUsersHook = { _ in await gate.wait(); throw CancellationError() }
        let m = AdminUsersModel(api: api)
        let task = Task { await m.reload() }
        await waitForCalls(api, 1)
        task.cancel()
        await gate.open()
        await task.value
        #expect(m.error == nil)
        #expect(m.users.isEmpty)
    }

    @Test func aTierChangeLoadsAtOnceButTypingWaits() async {
        let api = StubAPI()
        api.adminUsersResult = .success(page(1...2, total: 2))
        let m = AdminUsersModel(api: api)
        await m.filtersChanged(debounce: .seconds(60))     // first load: no wait
        #expect(api.calls.count == 1)
        m.tier = "pro"
        await m.filtersChanged(debounce: .seconds(60))     // tier: no wait
        #expect(api.calls.last == "adminUsers(page: 1, search: nil, tier: pro)")
        m.search = "a"
        let typing = Task { await m.filtersChanged(debounce: .seconds(60)) }
        await Task.yield()
        typing.cancel()                                     // the next key arrives
        await typing.value
        #expect(api.calls.count == 2)
    }
}
