import Foundation

/// The five parts of the health score, keyed as the server's `factors` object is.
public enum ScorePart: String, CaseIterable, Sendable, Hashable {
    case savingsRate = "savings_rate"
    case needs = "needs_ratio"
    case wants = "wants_ratio"
    case emergencyFund = "emergency_fund"
    case debtToIncome = "debt_to_income"

    public var title: String {
        switch self {
        case .savingsRate: "Savings rate"
        case .needs: "Needs"
        case .wants: "Wants"
        case .emergencyFund: "Emergency fund"
        case .debtToIncome: "Debt vs. income"
        }
    }

    /// The categories that make up this part, if it has any.
    public var budgetClass: BudgetClass? {
        switch self {
        case .needs: .need
        case .wants: .want
        default: nil
        }
    }

    /// The rule in plain words, per the server's thresholds (health-score.service.ts), with this month's value.
    /// `value` is as the API sends it: a percentage, months (emergency fund), or a 0-1 ratio (debt vs. income).
    public func rule(value: Double) -> String {
        switch self {
        case .savingsRate:
            "Full points when you save at least 20% of your income. This month came in at \(Self.percent(value))."
        case .needs:
            "Full points while needs stay at or under 50% of your income. This month came in at \(Self.percent(value))."
        case .wants:
            "Full points while wants stay at or under 30% of your income. This month came in at \(Self.percent(value))."
        case .emergencyFund:
            "Full points when your savings cover 6 months of spending. This month came in at \(Self.months(value))."
        case .debtToIncome:
            "Full points while debt payments stay at or under 10% of your income. This month came in at \(Self.percent(value * 100))."
        }
    }

    static func percent(_ value: Double) -> String {
        "\(trimmed(value))%"
    }

    static func months(_ value: Double) -> String {
        let text = trimmed(value)
        return text == "1" ? "1 month" : "\(text) months"
    }

    /// One decimal at most, dropping a trailing ".0".
    private static func trimmed(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        return rounded == rounded.rounded() ? String(Int(rounded)) : String(format: "%.1f", rounded)
    }
}
