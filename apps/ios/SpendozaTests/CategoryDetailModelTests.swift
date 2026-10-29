import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct CategoryDetailModelTests {
    private let oct = StubAPI.oct, sep = StubAPI.sep
    private let jun = DrillFixture.jun, jul = DrillFixture.jul, aug = StubAPI.aug
    private let dining = BudgetCategory(id: "c3", name: "Dining out", budgetClass: .want)

    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private func api() -> StubAPI {
        let api = DrillFixture.api()
        api.transactionList = [
            DrillFixture.tx("t1", "2026-10-18", 212.40, "Dining out"),
            DrillFixture.tx("t2", "2026-10-02", 25.30, "Dining out"),
            DrillFixture.tx("t3", "2026-10-23", 86.09, "Dining out"),
            DrillFixture.tx("t4", "2026-10-05", 1800, "Housing"),
            DrillFixture.tx("t5", "2026-10-09", 12, "Dining out", type: .credit),
            DrillFixture.tx("t6", "2026-10-11", 9, nil),
        ]
        return api
    }

    private func model(_ api: StubAPI, snapshot: HealthSnapshot = DrillFixture.snapshot()) async -> CategoryDetailModel {
        let m = CategoryDetailModel(category: dining, snapshot: snapshot, api: api, calendar: Self.calendar)
        await m.load()
        return m
    }

    @Test func amountAndChangeComeFromTheReports() async {
        let m = await model(api())
        #expect(m.total == 448)
        #expect(m.delta == 310)
        #expect(m.month == oct)
        #expect(m.sinceName == "September")
    }

    @Test func noPreviousMonthMeansNoChange() async {
        let m = await model(api(), snapshot: DrillFixture.snapshot(dropping: [sep]))
        #expect(m.delta == nil)
    }

    @Test func typicalMonthAveragesTheHistoryThatHasReports() async {
        #expect(await model(api()).typicalMonthly == 140)
        // July has no report: the average is over the three that do, (138 + 142 + 140) / 3.
        let gap = await model(api(), snapshot: DrillFixture.snapshot(dropping: [jul]))
        #expect(abs((gap.typicalMonthly ?? 0) - 140) < 0.001)
    }

    @Test func aMonthWithAReportButNoRowCountsAsZero() async {
        let base = DrillFixture.snapshot()
        let empty = StubAPI.report(jul, score: 64, previous: 73, points: [20, 20, 15, 10, 5], categories: [("Housing", 1800)])
        let snapshot = HealthSnapshot(report: base.report, previous: base.previous,
                                      history: base.history.map { $0.month == jul ? empty : $0 }, parts: base.parts,
                                      suggestion: nil, soFar: nil, isCached: false, updatedAt: .now)
        // (138 + 142 + 0 + 140) / 4 = 105
        #expect(await model(api(), snapshot: snapshot).typicalMonthly == 105)
    }

    @Test func noHistoryMeansNoTypicalMonth() async {
        let snapshot = HealthSnapshot(report: DrillFixture.report(oct), previous: nil, history: [], parts: [],
                                      suggestion: nil, soFar: nil, isCached: false, updatedAt: .now)
        let m = await model(api(), snapshot: snapshot)
        #expect(m.typicalMonthly == nil)
        #expect(m.trend == [oct: 448])
        #expect(m.suggestedBudget == 450)
    }

    @Test func trendHasFiveMonthsAndOmitsMissingOnes() async {
        let m = await model(api(), snapshot: DrillFixture.snapshot(dropping: [jul]))
        #expect(m.trendMonths == [jun, jul, aug, sep, oct])
        #expect(m.trend == [jun: 140, aug: 142, sep: 138, oct: 448])
    }

    @Test func transactionsAreOnlyThisCategorysDebitsNewestFirst() async {
        let api = api()
        let m = await model(api)
        #expect(m.transactions.map(\.id) == ["t3", "t1", "t2"])
        #expect(api.calls.contains("transactions"))
    }

    @Test func aFailedTransactionLoadShowsAnErrorButKeepsTheRest() async {
        let api = api()
        api.transactionsError = .offline
        let m = await model(api)
        #expect(m.transactions.isEmpty)
        #expect(m.loadError == APIError.offline.userMessage)
        #expect(m.total == 448)
    }

    @Test func recategorizeRemovesTheRowAndCallsSetCategory() async {
        let api = api()
        let m = await model(api)
        await m.recategorize(m.transactions[0], to: "Groceries")
        #expect(m.transactions.map(\.id) == ["t1", "t2"])
        #expect(api.calls.contains("setCategory(t3, Groceries)"))
        #expect(m.actionError == nil)
        #expect(m.lastMove?.transaction.id == "t3")
    }

    @Test func recategorizeRollsBackWithAnErrorWhenTheCallFails() async {
        let api = api()
        api.setCategoryError = .offline
        let m = await model(api)
        await m.recategorize(m.transactions[1], to: "Groceries")
        #expect(m.transactions.map(\.id) == ["t3", "t1", "t2"])
        #expect(m.actionError == APIError.offline.userMessage)
        #expect(m.lastMove == nil)
    }

    @Test func undoMovesItBack() async {
        let api = api()
        let m = await model(api)
        await m.recategorize(m.transactions[0], to: "Groceries")
        await m.undoLastMove()
        #expect(m.transactions.map(\.id) == ["t3", "t1", "t2"])
        #expect(api.calls.contains("setCategory(t3, Dining out)"))
        #expect(m.lastMove == nil)
    }

    @Test func categoriesToMoveToExcludeTheCurrentOne() async {
        let m = await model(api())
        #expect(m.moveTargets.map(\.name) == ["Entertainment", "Groceries", "Housing", "Personal"])
    }

    @Test func suggestedBudgetUsesTheHistoryAverageRoundedUp() async {
        #expect(await model(api()).suggestedBudget == 150)
    }

    @Test func setBudgetSavesAndNamesTheGoalAfterTheCategory() async {
        let api = api()
        let m = await model(api)
        #expect(await m.setBudget(amount: 150) == .saved)
        #expect(api.calls.contains("budget(Dining out budget, c3, 150)"))
        #expect(m.budgetSaved)
    }

    @Test func notOnPlanIsItsOwnResult() async {
        let api = api()
        api.budgetError = .notOnPlan(requiredTier: "starter")
        let m = await model(api)
        #expect(await m.setBudget(amount: 150) == .notOnPlan)
        #expect(!m.budgetSaved)
    }

    @Test func otherFailuresCarryTheirMessage() async {
        let api = api()
        api.budgetError = .message("Nope")
        let m = await model(api)
        #expect(await m.setBudget(amount: 150) == .failed("Nope"))
    }

    @Test func aBudgetNeedsAPositiveAmount() async {
        let api = api()
        let m = await model(api)
        #expect(await m.setBudget(amount: 0) == .failed("Enter an amount above $0."))
        #expect(!api.calls.contains { $0.hasPrefix("budget") })
    }

    @Test func theBudgetSheetParsesWholeDollarAmountsAboveZero() {
        #expect(BudgetSheet.amount(from: "150") == 150)
        #expect(BudgetSheet.amount(from: "$1,250") == 1250)
        #expect(BudgetSheet.amount(from: "149.6") == 150)
        #expect(BudgetSheet.amount(from: "0") == nil)
        #expect(BudgetSheet.amount(from: "0.4") == nil)
        #expect(BudgetSheet.amount(from: "") == nil)
        #expect(BudgetSheet.amount(from: "-20") == nil)
        #expect(BudgetSheet.amount(from: "abc") == nil)
    }

    @Test func moneyFormatsInUSDWithATrueMinus() {
        #expect(Money.whole(448) == "$448")
        #expect(Money.cents(212.4) == "$212.40")
        #expect(Money.signed(310) == "+$310")
        #expect(Money.signed(-22) == "−$22")
    }

    @Test func plansLinkIsThePricingPage() {
        #expect(PlanNotAvailableView.pricingURL.absoluteString == "https://www.spendoza.io/pricing")
    }
}
