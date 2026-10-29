import Foundation

public struct CategoryChange: Sendable, Equatable {
    public let category: String
    public let amount: Double
    /// Change since the previous month; nil when there is no previous report or the category is new.
    public let delta: Double?
}

/// This month's categories of one budget class, biggest increase first, nil deltas last.
/// Ties keep larger amounts first.
public func categoryChanges(
    current: ReportData, previous: ReportData?, budgetClass: BudgetClass, categories: [BudgetCategory]
) -> [CategoryChange] {
    let names = Set(categories.filter { $0.budgetClass == budgetClass }.map(\.name))
    let before = previous.map { Dictionary($0.byCategory.map { ($0.category, $0.amount) }, uniquingKeysWith: +) }
    let changes = current.byCategory
        .filter { names.contains($0.category) }
        .map { row in
            CategoryChange(category: row.category, amount: row.amount, delta: before?[row.category].map { row.amount - $0 })
        }
    return changes.sorted { a, b in
        switch (a.delta, b.delta) {
        case let (x?, y?): x != y ? x > y : a.amount > b.amount
        case (_?, nil): true
        case (nil, _?): false
        case (nil, nil): a.amount > b.amount
        }
    }
}
