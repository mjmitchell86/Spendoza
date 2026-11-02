import Foundation

public enum TransactionType: String, Decodable, Sendable {
    case credit, debit
}

/// A row of the `transactions` table. `date` stays the API's "YYYY-MM-DD" string.
public struct Transaction: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let date: String
    public let description: String
    public let amount: Double
    public let type: TransactionType
    public let category: String?
    /// The statement it came from (`bank_statement_id`).
    public let statementID: String?
    /// The household member it is assigned to (`attributed_to_user_id`).
    public let attributedTo: String?

    public init(id: String, date: String, description: String, amount: Double,
                type: TransactionType, category: String?, statementID: String? = nil, attributedTo: String? = nil) {
        self.id = id
        self.date = date
        self.description = description
        self.amount = amount
        self.type = type
        self.category = category
        self.statementID = statementID
        self.attributedTo = attributedTo
    }

    enum CodingKeys: String, CodingKey {
        case id, date, description, amount, type
        case category = "ai_category"
        case statementID = "bank_statement_id"
        case attributedTo = "attributed_to_user_id"
    }
}
