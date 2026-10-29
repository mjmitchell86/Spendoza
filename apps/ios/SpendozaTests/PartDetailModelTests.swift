import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct PartDetailModelTests {
    private let oct = StubAPI.oct, sep = StubAPI.sep, aug = StubAPI.aug
    private let jun = DrillFixture.jun, jul = DrillFixture.jul

    private func model(_ part: ScorePart, _ snapshot: HealthSnapshot = DrillFixture.snapshot()) async -> PartDetailModel {
        let m = PartDetailModel(part: part, snapshot: snapshot, api: DrillFixture.api())
        await m.load()
        return m
    }

    @Test func wantsMoversStartWithDiningOutAndExcludeNeeds() async {
        let m = await model(.wants)
        #expect(m.movers.map(\.category) == ["Dining out", "Entertainment", "Personal"])
        #expect(m.movers.first?.amount == 448)
        #expect(m.movers.first?.delta == 310)
        #expect(m.movers.last?.delta == -22)
    }

    @Test func needsMoversAreNeedsOnly() async {
        let m = await model(.needs)
        #expect(m.movers.map(\.category) == ["Housing"])
    }

    @Test func headerComesFromTheSnapshot() async {
        let m = await model(.wants)
        #expect(m.points == 9 && m.max == 15)
        #expect(m.delta == -6)
        #expect(m.sinceName == "September")
        #expect(m.ruleText?.contains("30% of your income") == true)
    }

    @Test func trendIsTheFiveMonthsEndingAtTheCheckupFromTheSnapshot() async {
        let api = DrillFixture.api()
        let m = PartDetailModel(part: .wants, snapshot: DrillFixture.snapshot(), api: api)
        await m.load()
        #expect(m.trendMonths == [jun, jul, aug, sep, oct])
        #expect(m.trend == [jun: 15, jul: 15, aug: 14, sep: 15, oct: 9])
        #expect(api.requestedMonths.isEmpty)
    }

    @Test func aMissingMonthIsAbsentFromTheTrend() async {
        let m = await model(.wants, DrillFixture.snapshot(dropping: [jul]))
        #expect(m.trend[jul] == nil)
        #expect(m.trend.count == 4)
        #expect(m.trendMonths.count == 5)
    }

    @Test func noPreviousMonthMeansNoDeltaButTheTrendStays() async {
        let m = await model(.wants, DrillFixture.snapshot(dropping: [sep]))
        #expect(m.delta == nil)
        #expect(m.trend[sep] == nil)
        #expect(m.movers.allSatisfy { $0.delta == nil })
    }

    @Test func savingsRateShowsIncomeVersusExpensesAndHasNoCategories() async {
        let m = await model(.savingsRate)
        #expect(m.movers.isEmpty)
        #expect(m.income == 5000 && m.expenses == 4000)
        #expect(m.showsIncomeVersusExpenses)
        #expect(m.primaryAction == nil)
    }

    @Test func emergencyFundsPrimaryActionIsOpenEmergencyFundButHasNoCategories() async {
        let m = await model(.emergencyFund)
        #expect(m.movers.isEmpty)
        #expect(m.primaryAction == .openEmergencyFund)
    }

    @Test func debtHasNoPrimaryActionUntilPlanFour() async {
        let m = await model(.debtToIncome)
        #expect(m.movers.isEmpty)
        #expect(m.primaryAction == nil)
    }

    @Test func wantsPrimaryActionIsTheBudgetForTheBiggestRise() async {
        let m = await model(.wants)
        // History average (142 + 138 + 140 + 140) / 4 = 140, rounded up to 150.
        #expect(m.primaryAction == .setBudget(categoryID: "c3", categoryName: "Dining out", amount: 150))
    }

    /// 10.52: needs lost points and both a need (Groceries) and a want (Dining out) rose; the budget is for the need.
    @Test func needsPrimaryActionIsANeedsBudgetNeverAWants() async throws {
        let current = StubAPI.report(oct, score: 60, previous: 70, points: [20, 14, 9, 10, 5],
                                     categories: [("Housing", 1800), ("Groceries", 700), ("Dining out", 448)])
        let previous = StubAPI.report(sep, score: 70, previous: nil, points: [20, 20, 15, 10, 5],
                                      categories: [("Housing", 1800), ("Groceries", 400), ("Dining out", 138)])
        let health = try #require(current.data.health)
        let snapshot = HealthSnapshot(report: current, previous: previous, history: [previous],
                                      parts: partChanges(current: health, previous: previous.data.health),
                                      suggestion: nil, soFar: nil, isCached: false, updatedAt: .now)
        let m = await model(.needs, snapshot)
        let action = try #require(m.primaryAction)
        guard case .setBudget(let id, let name, _) = action else {
            Issue.record("expected a budget, got \(action)")
            return
        }
        #expect(name == "Groceries")
        #expect(id == "c2")
    }

    @Test func meterFollowsTheServerThresholds() async {
        let wants = await model(.wants).meter
        #expect(wants?.value == 34 && wants?.threshold == 30 && wants?.upperBound == 50)
        #expect(wants?.meets == false)
        #expect(wants?.thresholdLabel == "30% line")
        let debt = await model(.debtToIncome).meter
        #expect(debt?.value == 45 && debt?.threshold == 10)   // the ratio 0.45 is shown as 45%
        let fund = await model(.emergencyFund).meter
        #expect(fund?.value == 1.5 && fund?.threshold == 6 && fund?.meets == false)
        let savings = await model(.savingsRate).meter
        #expect(savings?.threshold == 20)
    }

    @Test func theBudgetActionIsGoneOnceSaved() async {
        let api = DrillFixture.api()
        let m = PartDetailModel(part: .wants, snapshot: DrillFixture.snapshot(), api: api)
        await m.load()
        #expect(m.showsBudgetAction)
        api.budgetError = .notOnPlan(requiredTier: "starter")
        _ = await m.setBudget(categoryID: "c3", categoryName: "Dining out", goalName: "Dining out budget", amount: 150)
        #expect(m.showsBudgetAction)   // not saved, so still offered
        api.budgetError = nil
        _ = await m.setBudget(categoryID: "c3", categoryName: "Dining out", goalName: "Dining out budget", amount: 150)
        #expect(!m.showsBudgetAction)
    }

    @Test func settingABudgetSavesOrReportsThePlan() async {
        let api = DrillFixture.api()
        let m = PartDetailModel(part: .wants, snapshot: DrillFixture.snapshot(), api: api)
        #expect(await m.setBudget(categoryID: "c3", categoryName: "Dining out", goalName: "Dining out budget", amount: 150) == .saved)
        #expect(api.calls.contains("budget(Dining out budget, c3, 150)"))
        #expect(m.budgetSavedFor == "Dining out")
        api.budgetError = .notOnPlan(requiredTier: "starter")
        #expect(await m.setBudget(categoryID: "c3", categoryName: "Dining out", goalName: "Dining out budget", amount: 150) == .notOnPlan)
    }
}
