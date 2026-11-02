import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct CategoriesModelTests {
    private func api() -> StubAPI {
        let api = StubAPI()
        api.categoryList = [
            .init(id: "c1", name: "Housing", budgetClass: .need, isSystemDefault: true),
            .init(id: "c3", name: "dining out", budgetClass: .want, isSharedWithHousehold: true),
            .init(id: "c2", name: "Childcare", budgetClass: .need),
        ]
        return api
    }

    private func model(_ api: StubAPI, inHousehold: Bool = false) async -> CategoriesModel {
        let m = CategoriesModel(api: api, inHousehold: inHousehold)
        await m.load()
        return m
    }

    // MARK: List

    @Test func listIsSortedByNameAndOnlyCustomOnesAreEditable() async {
        let m = await model(api())
        #expect(m.categories.map(\.name) == ["Childcare", "dining out", "Housing"])
        #expect(m.canEdit(m.categories[0]))
        #expect(m.canEdit(m.categories[1]))
        #expect(!m.canEdit(m.categories[2]))
        #expect(m.categories[2].isSystemDefault)
    }

    @Test func loadFailureShowsTheServersWordsAndRetryRecovers() async {
        let api = api()
        api.categoriesError = .message("Failed to load categories")
        let m = await model(api)
        #expect(m.loadError == .message("Failed to load categories"))
        #expect(m.categories.isEmpty)
        api.categoriesError = nil
        await m.load()
        #expect(m.loadError == nil)
        #expect(m.categories.count == 3)
    }

    @Test func offlineUsesTheOfflineWords() async {
        let api = api()
        api.categoriesError = .offline
        let m = await model(api)
        #expect(m.loadError == .message("You're offline. Check your connection and try again."))
    }

    // MARK: Copy

    @Test func budgetClassOptionsAndHelpMatchTheWeb() {
        #expect(CategoriesModel.classOptions.map(\.title) ==
                ["Need (50%)", "Want (30%)", "Savings (20%)", "Transfer (not income or spending)", "Other"])
        #expect(CategoriesModel.classOptions.map(\.value) == [.need, .want, .savings, .transfer, .other])
        #expect(CategoriesModel.classHelp ==
                "Used for 50/30/20 budget allocation tracking. Savings counts as saved, not spent; transfers between your own accounts and credit card payments count as neither income nor spending.")
        #expect(CategoriesModel.sharedHelp == "Make this category visible to all household members")
    }

    @Test func newCategoriesDefaultToWant() {
        #expect(CategoryForm().budgetClass == .want)
    }

    @Test func deleteMessageIsTheWebsAndNamesTheCategory() {
        #expect(CategoriesModel.deleteMessage(name: "Childcare") ==
                "Are you sure you want to delete “Childcare”? Its transactions become uncategorized and its bills move to Other.")
    }

    // MARK: Create

    @Test func createSendsNameAndClass() async {
        let api = api()
        let m = await model(api)
        let error = await m.create(name: "  Pet Expenses ", budgetClass: .savings, shared: true)
        #expect(error == nil)
        // Outside a household the switch doesn't exist, so nothing is shared.
        #expect(api.calls.contains("createCategory(Pet Expenses, savings)"))
        #expect(m.categories.contains { $0.name == "Pet Expenses" })
        #expect(m.changed)
    }

    @Test func createInAHouseholdSendsTheSharedChoice() async {
        let api = api()
        let m = await model(api, inHousehold: true)
        _ = await m.create(name: "Pets", budgetClass: .want, shared: true)
        _ = await m.create(name: "Gifts", budgetClass: .other, shared: false)
        #expect(api.calls.contains("createCategory(Pets, want, shared)"))
        #expect(api.calls.contains("createCategory(Gifts, other)"))
    }

    @Test func aBlankNameIsNotSent() async {
        let api = api()
        let m = await model(api)
        let error = await m.create(name: "   ", budgetClass: .want, shared: false)
        #expect(error == nil)
        #expect(!api.calls.contains { $0.hasPrefix("createCategory") })
        #expect(!m.changed)
    }

    @Test func aDuplicateNameShowsTheServersText() async {
        let api = api()
        api.moneyErrors["createCategory"] = .message("You already have a category with that name")
        let m = await model(api)
        let error = await m.create(name: "Childcare", budgetClass: .need, shared: false)
        #expect(error == "You already have a category with that name")
        #expect(m.categories.count == 3)
        #expect(!m.changed)
    }

    @Test func offlineCreateShowsTheOfflineWords() async {
        let api = api()
        api.moneyErrors["createCategory"] = .offline
        let m = await model(api)
        let error = await m.create(name: "Pets", budgetClass: .need, shared: false)
        #expect(error == "You're offline. Check your connection and try again.")
    }

    // MARK: Update

    @Test func renameCallsUpdateCategory() async {
        let api = api()
        let m = await model(api)
        let childcare = m.categories.first { $0.id == "c2" }!
        let error = await m.update(childcare, name: "Kids", budgetClass: .need)
        #expect(error == nil)
        #expect(api.calls.contains("updateCategory(c2, Kids, need)"))
        #expect(m.categories.map(\.name) == ["dining out", "Housing", "Kids"])
        #expect(m.changed)
    }

    @Test func classChangeCallsUpdateCategory() async {
        let api = api()
        let m = await model(api)
        let childcare = m.categories.first { $0.id == "c2" }!
        _ = await m.update(childcare, name: "Childcare", budgetClass: .savings)
        #expect(api.calls.contains("updateCategory(c2, Childcare, savings)"))
        #expect(m.categories.first { $0.id == "c2" }?.budgetClass == .savings)
    }

    @Test func updateKeepsTheSharedFlagTheRowHad() async {
        let api = api()
        let m = await model(api, inHousehold: true)
        let dining = m.categories.first { $0.id == "c3" }!
        // The stub's reply has no sharing info; the row keeps what it had.
        _ = await m.update(dining, name: "Dining", budgetClass: .want)
        #expect(m.isShared("c3"))
    }

    @Test func updateFailureKeepsTheListAndShowsTheServersText() async {
        let api = api()
        api.moneyErrors["updateCategory"] = .message("You already have a category with that name")
        let m = await model(api)
        let childcare = m.categories.first { $0.id == "c2" }!
        let error = await m.update(childcare, name: "Housing", budgetClass: .need)
        #expect(error == "You already have a category with that name")
        #expect(m.categories.map(\.name) == ["Childcare", "dining out", "Housing"])
        #expect(!m.changed)
    }

    // MARK: Delete

    @Test func deleteRemovesTheCategory() async {
        let api = api()
        let m = await model(api)
        let childcare = m.categories.first { $0.id == "c2" }!
        let error = await m.delete(childcare)
        #expect(error == nil)
        #expect(api.calls.contains("deleteCategory(c2)"))
        #expect(m.categories.map(\.id) == ["c3", "c1"])
        #expect(m.changed)
    }

    @Test func deletingADefaultShowsTheServersRefusalVerbatim() async {
        let api = api()
        api.moneyErrors["deleteCategory"] = .message("Cannot delete system default categories")
        let m = await model(api)
        let housing = m.categories.first { $0.id == "c1" }!
        let error = await m.delete(housing)
        #expect(error == "Cannot delete system default categories")
        #expect(m.categories.count == 3)
        #expect(!m.changed)
    }

    @Test func anExpiredSessionLeavesNoErrorAndSignsOut() async {
        let api = api()
        api.moneyErrors["deleteCategory"] = .unauthorized
        let m = await model(api)
        var ended = false
        m.onSessionEnded = { ended = true }
        let error = await m.delete(m.categories[0])
        #expect(error == nil)
        #expect(ended)
    }

    // MARK: Sharing

    @Test func sharingSwitchReusesTheHomeTabsCall() async {
        let api = api()
        let m = await model(api, inHousehold: true)
        #expect(!m.isShared("c2"))
        await m.setShared("c2", true)
        #expect(api.calls.contains("setCategoryShared(c2, true)"))
        #expect(m.isShared("c2"))
        #expect(m.changed)
    }

    @Test func aFailedSharingSaveGoesBackAndShowsTheError() async {
        let api = api()
        api.householdActionErrors["setCategoryShared"] = .message("Category not found")
        let m = await model(api, inHousehold: true)
        await m.setShared("c2", true)
        #expect(!m.isShared("c2"))
        #expect(m.shareError == .message("Category not found"))
        #expect(!m.changed)
    }

    @Test func aPlanRefusalOnSharingShowsThePlanNotice() async {
        let api = api()
        api.householdActionErrors["setCategoryShared"] = .notOnPlan(requiredTier: "pro")
        let m = await model(api, inHousehold: true)
        await m.setShared("c2", true)
        #expect(m.shareError == .plan)
    }

    @Test func aSecondToggleWhileOneIsInFlightIsIgnored() async {
        final class Gate: @unchecked Sendable {
            private let lock = NSLock()
            private var cont: CheckedContinuation<Void, Never>?
            private var _entered = false
            private var _used = false
            var entered: Bool { lock.withLock { _entered } }
            var firstUse: Bool { lock.withLock { defer { _used = true }; return !_used } }
            func wait() async { await withCheckedContinuation { c in lock.withLock { _entered = true; cont = c } } }
            func open() { lock.withLock { cont?.resume(); cont = nil } }
        }
        let api = api()
        let gate = Gate()
        api.categorySharedHook = { id in if id == "c2", gate.firstUse { await gate.wait() } }
        let m = await model(api, inHousehold: true)
        let first = Task { await m.setShared("c2", true) }
        while !gate.entered { await Task.yield() }
        #expect(m.isUpdating("c2"))
        await m.setShared("c2", false)
        #expect(api.calls.filter { $0.hasPrefix("setCategoryShared(c2") } == ["setCategoryShared(c2, true)"])
        gate.open()
        await first.value
        #expect(!m.isUpdating("c2"))
        #expect(m.isShared("c2"))
    }
}
