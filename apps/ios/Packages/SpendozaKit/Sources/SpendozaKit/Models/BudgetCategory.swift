import Foundation

public enum BudgetClass: String, Codable, Sendable {
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
    /// Whether household members can see this category's spending (category sharing mode).
    public let isSharedWithHousehold: Bool
    /// A category every account starts with; the server refuses to delete or rename these.
    public let isSystemDefault: Bool

    public init(id: String, name: String, budgetClass: BudgetClass, isSharedWithHousehold: Bool = false,
                isSystemDefault: Bool = false) {
        self.id = id
        self.name = name
        self.budgetClass = budgetClass
        self.isSharedWithHousehold = isSharedWithHousehold
        self.isSystemDefault = isSystemDefault
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        budgetClass = try c.decode(BudgetClass.self, forKey: .budgetClass)
        isSharedWithHousehold = try c.decodeIfPresent(Bool.self, forKey: .isSharedWithHousehold) ?? false
        isSystemDefault = try c.decodeIfPresent(Bool.self, forKey: .isSystemDefault) ?? false
    }

    enum CodingKeys: String, CodingKey {
        case id, name
        case budgetClass = "budget_class"
        case isSharedWithHousehold = "is_shared_with_household"
        case isSystemDefault = "is_system_default"
    }
}
