import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct StatementDetailModelTests {
    private let when = Date(timeIntervalSince1970: 1_792_000_000)
    private let oct = Month(year: 2026, month: 10)
    private let ann = Member(id: "u-ann", displayName: "Ann Smith")
    private let bob = Member(id: "u-bob", displayName: "Bob Smith")

    private func tx(_ id: String, _ date: String = "2026-10-05", _ category: String? = "Groceries", by: String? = nil) -> Transaction {
        Transaction(id: id, date: date, description: "Item \(id)", amount: 10, type: .debit, category: category,
                    statementID: "s1", attributedTo: by)
    }

    private func make(shared: Bool = true, household: Bool = true, transactions: [Transaction]? = nil) async -> (StatementDetailModel, StubAPI) {
        let api = StubAPI()
        api.statementScript = [[Statement(id: "s1", status: .parsed, fileType: "pdf", bankName: "Chase", createdAt: when,
                                          statementMonth: oct, isShared: shared)]]
        api.statementTransactions["s1"] = transactions ?? [tx("t1", "2026-10-05"), tx("t2", "2026-10-09"), tx("t3", "2026-10-07")]
        if household {
            api.householdResult = .success(Household(id: "h", name: "The Smiths", headID: "me", members: [bob, ann]))
        }
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        await poller.refresh()
        let model = StatementDetailModel(api: api, statementID: "s1", poller: poller)
        await model.load()
        return (model, api)
    }

    // MARK: Loading

    @Test func loadsTheStatementsTransactionsNewestFirstWithMembersAndCategories() async {
        let (m, api) = await make()
        #expect(m.transactions.map(\.id) == ["t2", "t3", "t1"])
        #expect(m.members.map(\.displayName) == ["Ann Smith", "Bob Smith"])
        #expect(!m.categories.isEmpty)
        #expect(api.calls.contains("transactions(s1)"))
        #expect(m.title == "Transactions — Chase (October 2026)")
        #expect(m.loadError == nil)
    }

    @Test func aFailedLoadSaysSo() async {
        let api = StubAPI()
        api.transactionsError = .offline
        let model = StatementDetailModel(api: api, statementID: "s1", poller: StatementPoller(api: api))
        await model.load()
        #expect(model.loadError == "You're offline. Check your connection and try again.")
    }

    // MARK: Who can assign

    @Test func assignIsOfferedForASharedAccountInAHousehold() async {
        let (m, _) = await make()
        #expect(m.canAssign)
    }

    @Test func noAssignForAPersonalAccount() async {
        let (m, _) = await make(shared: false)
        #expect(!m.canAssign)
    }

    @Test func noAssignOutsideAHousehold() async {
        let (m, _) = await make(household: false)
        #expect(!m.canAssign)
    }

    // MARK: Category

    @Test func recategorizeShowsAtOnceAndSaves() async {
        let (m, api) = await make()
        await m.recategorize(m.transactions[0], to: "Dining out")
        #expect(m.transactions[0].category == "Dining out")
        #expect(api.calls.contains("setCategory(t2, Dining out)"))
        #expect(m.actionError == nil)
    }

    @Test func uncategorizingClearsTheCategory() async {
        let (m, api) = await make()
        await m.recategorize(m.transactions[0], to: nil)
        #expect(m.transactions[0].category == nil)
        #expect(api.calls.contains("setCategory(t2, nil)"))
    }

    @Test func aFailedRecategorizePutsItBackAndSaysWhy() async {
        let (m, api) = await make()
        api.setCategoryError = .offline
        await m.recategorize(m.transactions[0], to: "Dining out")
        #expect(m.transactions[0].category == "Groceries")
        #expect(m.actionError == "You're offline. Check your connection and try again.")
    }

    @Test func thePickerLeavesOutTheCurrentCategory() async {
        let (m, _) = await make()
        let targets = m.pickerTargets(for: m.transactions[0]).map(\.name)
        #expect(!targets.contains("Groceries"))
        #expect(targets.contains("Housing"))
        #expect(m.offersUncategorized(for: m.transactions[0]))
        #expect(!m.offersUncategorized(for: tx("x", "2026-10-01", nil)))
    }

    // MARK: Assign one

    @Test func assigningOneShowsAtOnceAndUsesTheSingleEndpoint() async {
        let (m, api) = await make()
        await m.assign(m.transactions[0], to: ann)
        #expect(m.transactions[0].attributedTo == "u-ann")
        #expect(m.assignee(of: m.transactions[0]) == "Ann Smith")
        #expect(api.calls.contains("attribute(t2, u-ann)"))
        #expect(!api.calls.contains { $0.hasPrefix("bulkAttribute") })
    }

    @Test func aRefusedAssignmentGoesBackWithTheServersWords() async {
        let (m, api) = await make()
        api.moneyErrors["attribute"] = .message("Only the statement uploader or head of household can attribute transactions")
        await m.assign(m.transactions[0], to: ann)
        #expect(m.transactions[0].attributedTo == nil)
        #expect(m.rowErrors["t2"] == "Only the statement uploader or head of household can attribute transactions")
    }

    // MARK: Bulk assign

    @Test func selectingAndAssigningSelectedUsesTheBulkEndpoint() async {
        let (m, api) = await make()
        m.startSelecting()
        m.toggle(m.transactions[0])
        m.toggle(m.transactions[2])
        #expect(m.selectedCount == 2)
        await m.assignSelected(to: bob)
        #expect(api.calls.contains("bulkAttribute(t2>u-bob,t1>u-bob)"))
        #expect(m.transactions.map(\.attributedTo) == ["u-bob", nil, "u-bob"])
        #expect(m.selected.isEmpty)
        #expect(!m.isSelecting)
        #expect(m.actionError == nil)
    }

    @Test func bulkAssignReportsEachRowThatFailed() async {
        let (m, api) = await make()
        api.bulkAttributeErrors = ["t3": "Failed to update transaction"]
        m.startSelecting()
        m.selectAll()
        await m.assignSelected(to: ann)
        #expect(m.transactions.map(\.attributedTo) == ["u-ann", nil, "u-ann"])
        #expect(m.rowErrors == ["t3": "Failed to update transaction"])
        #expect(m.selected == ["t3"])
        #expect(m.isSelecting)
        #expect(m.actionError == "1 transaction couldn't be assigned.")
    }

    @Test func aTransactionTheServerDidNotAnswerForCountsAsFailed() async {
        let (m, api) = await make()
        // The stub answers for every id; make it omit one the way a short server response would.
        api.bulkAttributeOmits = ["t1"]
        m.startSelecting()
        m.selectAll()
        await m.assignSelected(to: ann)
        #expect(m.rowErrors["t1"] == "Something went wrong. Try again.")
        #expect(m.transactions.first { $0.id == "t1" }?.attributedTo == nil)
        #expect(m.actionError == "1 transaction couldn't be assigned.")
    }

    @Test func aWholeBulkCallFailingKeepsTheSelection() async {
        let (m, api) = await make()
        api.moneyErrors["bulkAttribute"] = .offline
        m.startSelecting()
        m.selectAll()
        await m.assignSelected(to: ann)
        #expect(m.selectedCount == 3)
        #expect(m.transactions.allSatisfy { $0.attributedTo == nil })
        #expect(m.actionError == "You're offline. Check your connection and try again.")
    }

    @Test func assigningNothingDoesNotCallTheServer() async {
        let (m, api) = await make()
        m.startSelecting()
        await m.assignSelected(to: ann)
        #expect(!api.calls.contains { $0.hasPrefix("bulkAttribute") })
    }

    @Test func stoppingSelectionClearsIt() async {
        let (m, _) = await make()
        m.startSelecting()
        m.selectAll()
        m.stopSelecting()
        #expect(m.selected.isEmpty)
        #expect(!m.isSelecting)
    }
}
