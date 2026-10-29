import Foundation
import Observation
import SpendozaKit

/// One part of the score for the check-up month: the rule, where you stand, the five-month trend and what moved it.
/// Reports come from the snapshot (no refetch); `load()` only fetches the category list.
@MainActor @Observable
final class PartDetailModel {
    /// Where the value sits against the rule's line, on a scale from 0 to `upperBound`.
    struct Meter: Equatable {
        let value: Double
        let threshold: Double
        let upperBound: Double
        /// True when more is better (savings, emergency fund); false for caps (needs, wants, debt).
        let atLeast: Bool
        let lowLabel: String
        let thresholdLabel: String
        let upperLabel: String

        var meets: Bool { atLeast ? value >= threshold : value <= threshold }
    }

    let part: ScorePart
    let snapshot: HealthSnapshot
    private(set) var categories: [BudgetCategory] = []
    private(set) var loadError: String?
    private(set) var suggestion: Suggestion?

    @ObservationIgnored private let api: any SpendozaAPI

    init(part: ScorePart, snapshot: HealthSnapshot, api: any SpendozaAPI) {
        self.part = part
        self.snapshot = snapshot
        self.api = api
    }

    var month: Month { snapshot.report.month }
    /// "September", the month the change is measured against; only meaningful when `delta` isn't nil.
    var sinceName: String { month.previous.name }

    private var change: PartChange? { snapshot.parts.first { $0.part == part } }
    var points: Int { change?.points ?? 0 }
    var max: Int { change?.max ?? 0 }
    var delta: Int? { change?.delta }

    private var score: PartScore? { snapshot.report.data.health?.parts[part] }

    var ruleText: String? { score.map { part.rule(value: $0.value) } }

    // MARK: Trend

    var trendMonths: [Month] { fiveMonths(endingAt: month) }

    /// Points per month for the five months ending at the check-up month; a month without a report is absent.
    var trend: [Month: Int] {
        var out: [Month: Int] = [:]
        for report in [snapshot.report] + snapshot.history where trendMonths.contains(report.month) {
            if let points = report.data.health?.parts[part]?.points { out[report.month] = points }
        }
        return out
    }

    // MARK: Meter

    var meter: Meter? {
        guard let value = score?.value else { return nil }
        switch part {
        case .savingsRate:
            return Meter(value: value, threshold: 20, upperBound: 30, atLeast: true,
                         lowLabel: "0%", thresholdLabel: "20% line", upperLabel: "30%")
        case .needs:
            return Meter(value: value, threshold: 50, upperBound: 80, atLeast: false,
                         lowLabel: "0%", thresholdLabel: "50% line", upperLabel: "80%")
        case .wants:
            return Meter(value: value, threshold: 30, upperBound: 50, atLeast: false,
                         lowLabel: "0%", thresholdLabel: "30% line", upperLabel: "50%")
        case .emergencyFund:
            return Meter(value: value, threshold: 6, upperBound: 8, atLeast: true,
                         lowLabel: "0", thresholdLabel: "6 mo line", upperLabel: "8 mo")
        case .debtToIncome:
            // The API sends a 0-1 ratio.
            return Meter(value: (value * 1000).rounded() / 10, threshold: 10, upperBound: 60, atLeast: false,
                         lowLabel: "0%", thresholdLabel: "10% line", upperLabel: "60%")
        }
    }

    // MARK: Savings rate

    var showsIncomeVersusExpenses: Bool { part == .savingsRate }
    var income: Double { snapshot.report.data.totalIncome }
    var expenses: Double { snapshot.report.data.totalExpenses }

    // MARK: What moved it

    /// This part's categories, biggest increase first; empty for parts that have no category list.
    var movers: [CategoryChange] {
        guard let budgetClass = part.budgetClass else { return [] }
        return categoryChanges(current: snapshot.report.data, previous: snapshot.previous?.data,
                               budgetClass: budgetClass, categories: categories)
    }

    /// The category behind a mover row, for opening its screen.
    func category(named name: String) -> BudgetCategory? { categories.first { $0.name == name } }

    /// What to do about this part: a budget for its biggest rise, or (emergency fund) a pointer with no
    /// destination until the Plan tab. Debt vs. income and Savings rate have none yet.
    var primaryAction: SuggestionAction? { suggestion?.action }

    func load() async {
        loadError = nil
        do {
            categories = try await api.categories()
        } catch {
            categories = []
            loadError = userMessage(for: error)
        }
        suggestion = matchingSuggestion()
    }

    private func matchingSuggestion() -> Suggestion? {
        let all = suggestions(current: snapshot.report, previous: snapshot.previous,
                              history: snapshot.history, categories: categories)
        let names = Set(categories.filter { $0.budgetClass == part.budgetClass }.map(\.name))
        return all.first { suggestion in
            switch (part, suggestion.action) {
            case (.needs, .setBudget(_, let name, _)), (.wants, .setBudget(_, let name, _)): names.contains(name)
            case (.emergencyFund, .openEmergencyFund): true
            default: false
            }
        }
    }

    func setBudget(categoryID: String, name: String, amount: Int) async -> BudgetResult {
        await saveBudgetGoal(api: api, categoryID: categoryID, categoryName: name, amount: amount)
    }
}
