import Testing
@testable import SpendozaKit

@Suite struct ScoreTests {
    @Test func bands() {
        #expect(ScoreBand(score: 0) == .low)
        #expect(ScoreBand(score: 39) == .low)
        #expect(ScoreBand(score: 40) == .fair)
        #expect(ScoreBand(score: 69) == .fair)
        #expect(ScoreBand(score: 70) == .good)
        #expect(ScoreBand(score: 100) == .good)
        #expect(ScoreBand.low.name == "Low")
        #expect(ScoreBand.fair.name == "Fair")
        #expect(ScoreBand.good.name == "Good")
    }

    @Test func partChangesCompareToPrevious() throws {
        let oct = try #require(Fixture.october.data.health)
        let sep = try #require(Fixture.september.data.health)
        let changes = partChanges(current: oct, previous: sep)
        #expect(changes.map(\.part) == ScorePart.allCases)
        #expect(changes.first { $0.part == .wants }?.delta == -6)
        #expect(changes.first { $0.part == .savingsRate }?.delta == -3)
        #expect(changes.first { $0.part == .needs }?.delta == 0)
        #expect(changes.first { $0.part == .wants }?.points == 9)
        #expect(changes.first { $0.part == .wants }?.max == 15)
    }

    @Test func partChangesWithoutPreviousHaveNoDelta() throws {
        let oct = try #require(Fixture.october.data.health)
        let changes = partChanges(current: oct, previous: nil)
        #expect(changes.count == 5)
        #expect(changes.allSatisfy { $0.delta == nil })
    }

    @Test func categoryChangesForWants() throws {
        let changes = categoryChanges(
            current: try Fixture.october.data, previous: try Fixture.september.data,
            budgetClass: .want, categories: Fixture.categories)
        #expect(changes.first?.category == "Dining out")
        #expect(changes.first?.delta == 310)
        #expect(changes.first?.amount == 430)
        #expect(!changes.contains { $0.category == "Housing" })
        // Streaming (delta 0) before Gym (new this month, nil delta last).
        #expect(changes.map(\.category) == ["Dining out", "Streaming", "Gym"])
        #expect(changes.last?.delta == nil)
    }

    @Test func categoryChangesWithoutPreviousHaveNoDeltas() throws {
        let changes = categoryChanges(
            current: try Fixture.october.data, previous: nil,
            budgetClass: .need, categories: Fixture.categories)
        #expect(Set(changes.map(\.category)) == ["Housing", "Groceries"])
        #expect(changes.allSatisfy { $0.delta == nil })
    }

    @Test func ruleText() {
        #expect(ScorePart.wants.rule(value: 34)
            == "Full points while wants stay at or under 30% of your income. This month came in at 34%.")
        #expect(ScorePart.savingsRate.rule(value: 16)
            == "Full points when you save at least 20% of your income. This month came in at 16%.")
        #expect(ScorePart.needs.rule(value: 48)
            == "Full points while needs stay at or under 50% of your income. This month came in at 48%.")
        #expect(ScorePart.emergencyFund.rule(value: 1.5)
            == "Full points when your savings cover 6 months of spending. This month came in at 1.5 months.")
        #expect(ScorePart.debtToIncome.rule(value: 0.45)
            == "Full points while debt payments stay at or under 10% of your income. This month came in at 45%.")
    }

    @Test func titlesAndClasses() {
        #expect(ScorePart.allCases.map(\.title)
            == ["Savings rate", "Needs", "Wants", "Emergency fund", "Debt vs. income"])
        #expect(ScorePart.needs.budgetClass == .need)
        #expect(ScorePart.wants.budgetClass == .want)
        #expect(ScorePart.savingsRate.budgetClass == nil)
    }
}
