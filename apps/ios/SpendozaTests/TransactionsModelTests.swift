import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct TransactionsModelTests {
    private let oct = Month(year: 2026, month: 10)

    private func tx(_ id: String, _ date: String, _ name: String, _ amount: Double, _ category: String?,
                    type: TransactionType = .debit) -> Transaction {
        Transaction(id: id, date: date, description: name, amount: amount, type: type, category: category)
    }

    private func api() -> StubAPI {
        let api = StubAPI()
        api.categoryList = DrillFixture.categories
        api.transactionList = [
            tx("t1", "2026-10-18", "Steakhouse 1820", 212.40, "Dining out"),
            tx("t2", "2026-10-23", "Olive Garden", 86.09, "Dining out"),
            tx("t3", "2026-10-23", "Paycheck", 2400, nil, type: .credit),
            tx("t4", "2026-10-02", "Trader Joe's", 64.10, "Groceries"),
            tx("t5", "2026-10-02", "Mystery charge", 9.99, nil),
        ]
        return api
    }

    private func model(_ api: StubAPI) async -> TransactionsModel {
        let m = TransactionsModel(api: api, month: oct)
        await m.load()
        return m
    }

    @Test func loadsTheMonthNewestFirstAndGroupsByDay() async {
        let m = await model(api())
        #expect(m.visible.map(\.id) == ["t2", "t3", "t1", "t4", "t5"])
        #expect(m.days.map(\.title) == ["Oct 23", "Oct 18", "Oct 2"])
        #expect(m.days.map { $0.transactions.count } == [2, 1, 2])
        #expect(m.categories.map(\.name).contains("Groceries"))
    }

    @Test func searchIgnoresCase() async {
        let m = await model(api())
        m.search = "OLIVE"
        #expect(m.visible.map(\.id) == ["t2"])
    }

    @Test func typeFilterKeepsCreditsOrDebits() async {
        let m = await model(api())
        m.type = .credit
        #expect(m.visible.map(\.id) == ["t3"])
        m.type = .debit
        #expect(m.visible.count == 4)
    }

    @Test func uncategorizedFilterMatchesTransactionsWithoutACategory() async {
        let m = await model(api())
        m.category = TransactionsModel.uncategorized
        #expect(m.visible.map(\.id) == ["t3", "t5"])
        m.category = "Groceries"
        #expect(m.visible.map(\.id) == ["t4"])
    }

    @Test func searchAndBothFiltersCombine() async {
        let m = await model(api())
        m.search = "o"
        m.type = .debit
        m.category = "Dining out"
        #expect(m.visible.map(\.id) == ["t2", "t1"])
        m.search = "steak"
        #expect(m.visible.map(\.id) == ["t1"])
        m.search = "zzz"
        #expect(m.visible.isEmpty)
        #expect(m.days.isEmpty)
    }

    @Test func recategorizeCallsSetCategoryAndMovesTheRow() async {
        let api = api()
        let m = await model(api)
        m.category = "Dining out"
        await m.recategorize(m.all.first { $0.id == "t2" }!, to: "Groceries")
        #expect(api.calls.contains("setCategory(t2, Groceries)"))
        #expect(m.all.first { $0.id == "t2" }?.category == "Groceries")
        #expect(m.visible.map(\.id) == ["t1"])
        #expect(m.lastMove?.destination == "Groceries")
        #expect(m.actionError == nil)
    }

    @Test func anOfflineFailurePutsTheRowBackWithTheOfflineText() async {
        let api = api()
        api.setCategoryError = .offline
        let m = await model(api)
        await m.recategorize(m.all.first { $0.id == "t1" }!, to: "Groceries")
        #expect(m.all.first { $0.id == "t1" }?.category == "Dining out")
        #expect(m.actionError == "You're offline. Check your connection and try again.")
        #expect(m.lastMove == nil)
    }

    @Test func undoSendsTheOldCategoryAndRestoresIt() async {
        let api = api()
        let m = await model(api)
        await m.recategorize(m.all.first { $0.id == "t1" }!, to: nil)
        #expect(m.lastMove?.destination == "Uncategorized")
        await m.undo()
        #expect(api.calls.contains("setCategory(t1, Dining out)"))
        #expect(m.all.first { $0.id == "t1" }?.category == "Dining out")
        #expect(m.lastMove == nil)
    }

    @Test func undoThatFailsKeepsTheMoveAndShowsTheError() async {
        let api = api()
        let m = await model(api)
        await m.recategorize(m.all.first { $0.id == "t1" }!, to: "Groceries")
        api.setCategoryError = .offline
        await m.undo()
        #expect(m.all.first { $0.id == "t1" }?.category == "Groceries")
        #expect(m.lastMove != nil)
        #expect(m.actionError == APIError.offline.userMessage)
    }

    @Test func creditsShowAPlusAndDebitsATrueMinus() async {
        let m = await model(api())
        #expect(TransactionsModel.amountText(m.all.first { $0.id == "t3" }!) == "+$2,400.00")
        #expect(TransactionsModel.amountText(m.all.first { $0.id == "t1" }!) == "−$212.40")
    }

    @Test func aFailedLoadSaysSo() async {
        let api = api()
        api.transactionsError = .offline
        let m = await model(api)
        #expect(m.loadError == APIError.offline.userMessage)
        #expect(m.all.isEmpty)
    }
}
