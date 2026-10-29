import Foundation

public struct Suggestion: Sendable, Equatable {
    public let title: String
    public let detail: String
    public let action: SuggestionAction
}

public enum SuggestionAction: Sendable, Equatable {
    case setBudget(categoryID: String, categoryName: String, amount: Int)
    case openEmergencyFund
    case none
}

/// Deterministic suggestions from the parts, at most three.
///
/// `history` holds the reports for the months before `current`, newest first (up to four); `history.first`
/// is the previous month.
///
/// Budget amount rule: the average of the category's amount across the `history` months (a month with a
/// report but no row for the category counts as 0), rounded UP to the nearest 50. With no history, the
/// current month's amount is rounded up to the nearest 50.
public func suggestions(current: Report, history: [Report], categories: [Category]) -> [Suggestion] {
    guard let health = current.data.health else { return [] }
    let previousReport = history.first
    let changes = partChanges(current: health, previous: previousReport?.data.health)

    // Worst first: the biggest point loss, else the biggest shortfall from full points.
    let ranked = changes
        .filter { ($0.delta ?? 0) < 0 || $0.points < $0.max }
        .enumerated()
        .sorted { a, b in
            let (x, y) = (a.element, b.element)
            let lossX = -(Swift.min(x.delta ?? 0, 0)), lossY = -(Swift.min(y.delta ?? 0, 0))
            if lossX != lossY { return lossX > lossY }
            let gapX = x.max - x.points, gapY = y.max - y.points
            if gapX != gapY { return gapX > gapY }
            return a.offset < b.offset
        }
        .map(\.element)

    var result: [Suggestion] = []
    func add(_ suggestion: Suggestion?) {
        if let suggestion, result.count < 3 { result.append(suggestion) }
    }
    func suggestion(for change: PartChange) -> Suggestion? {
        let value = health.parts[change.part]?.value ?? 0
        switch change.part {
        case .needs, .wants:
            return budgetSuggestion(change, current: current, history: history, categories: categories)
        case .emergencyFund:
            return value < 3 ? emergencySuggestion(value: value) : nil
        case .savingsRate:
            return Suggestion(
                title: "Raise your savings rate",
                detail: "Saving 20% of your income earns full points. You saved \(ScorePart.percent(value)).",
                action: .none)
        case .debtToIncome:
            return Suggestion(
                title: "Bring debt payments down",
                detail: "Debt payments at or under 10% of your income earn full points. Yours are \(ScorePart.percent(value * 100)).",
                action: .none)
        }
    }

    if let worst = ranked.first { add(suggestion(for: worst)) }
    // Emergency fund under 3 months always gets a prompt.
    let emergencyValue = health.parts[.emergencyFund]?.value
    if let emergencyValue, emergencyValue < 3, !result.contains(where: { $0.action == .openEmergencyFund }) {
        add(emergencySuggestion(value: emergencyValue))
    }
    for change in ranked.dropFirst() where result.count < 3 {
        guard let next = suggestion(for: change), !result.contains(next) else { continue }
        if next.action == .openEmergencyFund { continue }
        add(next)
    }
    return result
}

private func emergencySuggestion(value: Double) -> Suggestion {
    Suggestion(
        title: "Build your emergency fund",
        detail: "Your savings cover about \(ScorePart.months(value)). Three months earns more points and six earns full points.",
        action: .openEmergencyFund)
}

private func budgetSuggestion(
    _ change: PartChange, current: Report, history: [Report], categories: [Category]
) -> Suggestion? {
    guard let budgetClass = change.part.budgetClass else { return nil }
    let previousReport = history.first
    let rows = categoryChanges(
        current: current.data, previous: previousReport?.data, budgetClass: budgetClass, categories: categories)
    let pick: CategoryChange?
    if previousReport != nil {
        pick = rows.first { ($0.delta ?? 0) > 0 }
    } else {
        pick = rows.max { $0.amount < $1.amount }
    }
    let lost = (change.delta ?? 0) < 0 ? -(change.delta ?? 0) : 0
    let cost = lost > 0 ? " \(change.part.title) cost you \(lost) \(lost == 1 ? "point" : "points")." : ""

    guard let pick, let category = categories.first(where: { $0.name == pick.category }) else {
        return Suggestion(
            title: "Trim your \(change.part.title.lowercased()) spending",
            detail: "Your \(change.part.title.lowercased()) score is \(change.points) of \(change.max).\(cost)",
            action: .none)
    }
    let amount = budgetAmount(for: pick.category, currentAmount: pick.amount, history: history)
    var detail: String
    if let delta = pick.delta, let previousReport {
        detail = "\(pick.category) is up \(dollars(delta)) since \(previousReport.month.name).\(cost)"
    } else {
        detail = "\(pick.category) is your biggest \(budgetClass == .want ? "wants" : "needs") category this month at \(dollars(pick.amount))."
    }
    detail = detail.trimmingCharacters(in: .whitespaces)
    return Suggestion(
        title: "Set a \(dollars(Double(amount))) budget for \(pick.category)",
        detail: detail,
        action: .setBudget(categoryID: category.id, categoryName: category.name, amount: amount))
}

private func budgetAmount(for category: String, currentAmount: Double, history: [Report]) -> Int {
    let average: Double
    if history.isEmpty {
        average = currentAmount
    } else {
        let total = history.reduce(0.0) { sum, report in
            sum + (report.data.byCategory.first { $0.category == category }?.amount ?? 0)
        }
        average = total / Double(history.count)
    }
    return Int((average / 50).rounded(.up)) * 50
}

private func dollars(_ amount: Double) -> String {
    "$\(Int(amount.rounded()))"
}
