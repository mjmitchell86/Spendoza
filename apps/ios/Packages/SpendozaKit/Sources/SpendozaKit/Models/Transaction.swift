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

    enum CodingKeys: String, CodingKey {
        case id, date, description, amount, type
        case category = "ai_category"
    }
}
