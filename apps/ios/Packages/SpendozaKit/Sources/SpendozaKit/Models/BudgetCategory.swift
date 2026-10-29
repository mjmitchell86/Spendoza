import Foundation

public enum BudgetClass: String, Decodable, Sendable {
    case need, want, savings, other
}

/// A row of `GET /api/categories`.
public struct BudgetCategory: Decodable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let budgetClass: BudgetClass

    public init(id: String, name: String, budgetClass: BudgetClass) {
        self.id = id
        self.name = name
        self.budgetClass = budgetClass
    }

    enum CodingKeys: String, CodingKey {
        case id, name
        case budgetClass = "budget_class"
    }
}
