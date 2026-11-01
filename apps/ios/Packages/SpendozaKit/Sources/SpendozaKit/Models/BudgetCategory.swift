import Foundation

public enum BudgetClass: String, Decodable, Sendable {
    /// `transfer`: money moving between the person's own accounts, neither income nor spending.
    case need, want, savings, transfer, other

    /// A class this version doesn't know yet reads as `other`, so a new server value never breaks the category list.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = BudgetClass(rawValue: raw) ?? .other
    }
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
