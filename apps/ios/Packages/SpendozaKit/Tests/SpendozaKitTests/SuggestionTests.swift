import Foundation
import Testing
@testable import SpendozaKit

@Suite struct SuggestionTests {
    /// A prior-month report with the given Dining out amount (nil = no Dining out row) and no health score.
    private func prior(_ apiMonth: String, dining: Double?) throws -> Report {
        var rows = #"{"category":"Housing","amount":1800,"percentage":40}"#
        if let dining { rows += #",{"category":"Dining out","amount":\#(dining),"percentage":5}"# }
        let json = """
        {"report_month":"\(apiMonth)","ai_insights":null,"generated_at":"2026-01-01T00:00:00Z",
         "report_data":{"total_income":5000,"total_expenses":4000,"savings_rate":20,
          "by_category":[\(rows)]}}
        """
        return try JSONDecoder().decode(Report.self, from: Data(json.utf8))
    }

    /// History newest first: Sep (fixture, Dining out 120), Aug 260, Jul 260, Jun 260.
    /// Average = (120 + 260 + 260 + 260) / 4 = 225, rounded UP to the nearest 50 = 250.
    private func history() throws -> [Report] {
        [try Fixture.september,
         try prior("2026-08-01", dining: 260),
         try prior("2026-07-01", dining: 260),
         try prior("2026-06-01", dining: 260)]
    }

    @Test func biggestLossPartSuggestsBudgetForBiggestIncrease() throws {
        let result = suggestions(current: try Fixture.october, previous: try Fixture.september, history: try history(), categories: Fixture.categories)
        let first = try #require(result.first)
        #expect(first.action == .setBudget(categoryID: "c3", categoryName: "Dining out", amount: 250))
        #expect(first.title == "Set a $250 budget for Dining out")
        #expect(first.detail.contains("cost you 6 points"))
        #expect(first.detail.contains("up $310 since September"))
    }

    @Test func monthWithoutCategoryRowCountsAsZero() throws {
        // (120 + 0 + 0 + 0) / 4 = 30, rounded up to 50.
        let hist = [try Fixture.september, try prior("2026-08-01", dining: nil),
                    try prior("2026-07-01", dining: nil), try prior("2026-06-01", dining: nil)]
        let first = try #require(suggestions(current: try Fixture.october, previous: try Fixture.september, history: hist, categories: Fixture.categories).first)
        #expect(first.action == .setBudget(categoryID: "c3", categoryName: "Dining out", amount: 50))
    }

    @Test func exactMultipleDoesNotRoundUp() throws {
        // (120 + 280 + 200 + 200) / 4 = 200, already a multiple of 50.
        let hist = [try Fixture.september, try prior("2026-08-01", dining: 280),
                    try prior("2026-07-01", dining: 200), try prior("2026-06-01", dining: 200)]
        let first = try #require(suggestions(current: try Fixture.october, previous: try Fixture.september, history: hist, categories: Fixture.categories).first)
        #expect(first.action == .setBudget(categoryID: "c3", categoryName: "Dining out", amount: 200))
    }

    @Test func emergencyFundUnderThreeMonthsAddsAction() throws {
        let result = suggestions(current: try Fixture.october, previous: try Fixture.september, history: try history(), categories: Fixture.categories)
        #expect(result.contains { $0.action == .openEmergencyFund })
    }

    @Test func noHistoryUsesCurrentMonthOnly() throws {
        let result = suggestions(current: try Fixture.october, previous: nil, history: [], categories: Fixture.categories)
        // Largest wants category this month: Dining out 430, rounded up to 450.
        #expect(result.map(\.action).contains(.setBudget(categoryID: "c3", categoryName: "Dining out", amount: 450)))
        #expect(!result.contains { $0.detail.contains("cost you") || $0.title.contains("cost you") })
        #expect(result.contains { $0.action == .openEmergencyFund })
    }

    @Test func actionableSuggestionsComeFirstWithoutHistory() throws {
        // Gaps from full points: debt 15, emergency fund 10, wants 6, savings 5. Actionable first by gap
        // (emergency fund, wants budget), then action-less by gap (debt); savings is cut by the limit of 3.
        let result = suggestions(current: try Fixture.october, previous: nil, history: [], categories: Fixture.categories)
        #expect(result.map(\.action) == [
            .openEmergencyFund,
            .setBudget(categoryID: "c3", categoryName: "Dining out", amount: 450),
            .none,
        ])
        #expect(result.first?.action != SuggestionAction.none)
        #expect(result.last?.title == "Bring debt payments down")
    }

    @Test func actionableSuggestionsComeFirstWithHistory() throws {
        // Wants lost 6 points, savings lost 3; emergency fund and debt lost none.
        let result = suggestions(current: try Fixture.october, previous: try Fixture.september, history: try history(), categories: Fixture.categories)
        #expect(result.map(\.action) == [
            .setBudget(categoryID: "c3", categoryName: "Dining out", amount: 250),
            .openEmergencyFund,
            .none,
        ])
        #expect(result.last?.title == "Raise your savings rate")
    }

    @Test func atMostThree() throws {
        let result = suggestions(current: try Fixture.october, previous: try Fixture.september, history: try history(), categories: Fixture.categories)
        #expect(result.count <= 3)
        #expect(!result.isEmpty)
    }

    @Test func noHealthScoreMeansNoSuggestions() throws {
        let report = try prior("2026-10-01", dining: 100)
        #expect(suggestions(current: report, previous: nil, history: [], categories: Fixture.categories).isEmpty)
    }

    @Test func aMissingPreviousMonthMeansNoComparisonWording() throws {
        // August exists but September doesn't: nothing may say "since August" or "cost you".
        let aug = try prior("2026-08-01", dining: 260)
        let result = suggestions(current: try Fixture.october, previous: nil, history: [aug], categories: Fixture.categories)
        #expect(!result.isEmpty)
        for suggestion in result {
            #expect(!suggestion.detail.contains("cost you"))
            #expect(!suggestion.detail.contains("since August"))
        }
        // Ranking falls back to the distance from full points: debt (15), emergency fund (10), wants (6), savings (5).
        #expect(result.first?.action == .openEmergencyFund)
        let budget = try #require(result.first { if case .setBudget = $0.action { true } else { false } })
        #expect(budget.detail == "Dining out is your biggest wants category this month at $430.")
        // The average still uses the history that exists: 260 -> $300.
        #expect(budget.action == .setBudget(categoryID: "c3", categoryName: "Dining out", amount: 300))
    }

    @Test func suggestedBudgetAmountIsExposedForTheCategoryScreen() throws {
        #expect(suggestedBudgetAmount(for: "Dining out", currentAmount: 448, history: try history()) == 250)
        // No history: the current amount, rounded up to 50.
        #expect(suggestedBudgetAmount(for: "Dining out", currentAmount: 448, history: []) == 450)
    }
}
