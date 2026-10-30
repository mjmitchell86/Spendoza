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
}
