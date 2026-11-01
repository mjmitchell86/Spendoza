import Foundation

public enum ExpenseFrequency: String, Codable, Sendable {
    case oneTime = "one_time"
    case recurring
}

public enum RecurrenceInterval: String, Codable, Sendable, CaseIterable {
    case weekly, biweekly, monthly, quarterly, annually
}

/// A row of `GET /api/expenses`: a bill. Dates are the API's "YYYY-MM-DD", read in the device calendar.
public struct Expense: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let categoryID: String
    public let description: String
    public let friendlyName: String?
    public let amount: Double
    public let frequency: ExpenseFrequency
    /// nil for a one-time bill.
    public let interval: RecurrenceInterval?
    public let nextDueDate: Date
    public let endDate: Date?
    public let autoDetected: Bool
    public let isAIAdjusted: Bool
    public let originalAmount: Double?

    public init(id: String, categoryID: String, description: String, friendlyName: String? = nil, amount: Double,
                frequency: ExpenseFrequency, interval: RecurrenceInterval? = nil, nextDueDate: Date, endDate: Date? = nil,
                autoDetected: Bool = false, isAIAdjusted: Bool = false, originalAmount: Double? = nil) {
        self.id = id
        self.categoryID = categoryID
        self.description = description
        self.friendlyName = friendlyName
        self.amount = amount
        self.frequency = frequency
        self.interval = interval
        self.nextDueDate = nextDueDate
        self.endDate = endDate
        self.autoDetected = autoDetected
        self.isAIAdjusted = isAIAdjusted
        self.originalAmount = originalAmount
    }

    enum CodingKeys: String, CodingKey {
        case id, description, amount, frequency
        case categoryID = "category_id"
        case friendlyName = "friendly_name"
        case interval = "recurrence_interval"
        case nextDueDate = "next_due_date"
        case endDate = "end_date"
        case autoDetected = "auto_detected"
        case isAIAdjusted = "is_ai_adjusted"
        case originalAmount = "original_amount"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        categoryID = try c.decode(String.self, forKey: .categoryID)
        description = try c.decode(String.self, forKey: .description)
        friendlyName = try c.decodeIfPresent(String.self, forKey: .friendlyName)
        amount = try c.decode(Double.self, forKey: .amount)
        frequency = try c.decode(ExpenseFrequency.self, forKey: .frequency)
        interval = try c.decodeIfPresent(RecurrenceInterval.self, forKey: .interval)
        nextDueDate = try c.decodeDay(forKey: .nextDueDate)
        endDate = try c.decodeDayIfPresent(forKey: .endDate)
        autoDetected = try c.decodeIfPresent(Bool.self, forKey: .autoDetected) ?? false
        isAIAdjusted = try c.decodeIfPresent(Bool.self, forKey: .isAIAdjusted) ?? false
        originalAmount = try c.decodeIfPresent(Double.self, forKey: .originalAmount)
    }
}

/// The body of a create or update. `recurrence_interval` is sent only for a recurring bill; an empty friendly name
/// and a missing end date go as explicit nulls so an update clears them.
public struct ExpenseDraft: Encodable, Sendable, Equatable {
    public var categoryID: String
    public var description: String
    public var friendlyName: String?
    public var amount: Double
    public var frequency: ExpenseFrequency
    public var interval: RecurrenceInterval?
    public var nextDueDate: Date
    public var endDate: Date?

    public init(categoryID: String, description: String, friendlyName: String? = nil, amount: Double,
                frequency: ExpenseFrequency, interval: RecurrenceInterval? = nil, nextDueDate: Date, endDate: Date? = nil) {
        self.categoryID = categoryID
        self.description = description
        self.friendlyName = friendlyName
        self.amount = amount
        self.frequency = frequency
        self.interval = interval
        self.nextDueDate = nextDueDate
        self.endDate = endDate
    }

    enum CodingKeys: String, CodingKey {
        case description, amount, frequency
        case categoryID = "category_id"
        case friendlyName = "friendly_name"
        case interval = "recurrence_interval"
        case nextDueDate = "next_due_date"
        case endDate = "end_date"
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(categoryID, forKey: .categoryID)
        try c.encode(description, forKey: .description)
        try c.encode(friendlyName.nonEmptyTrimmed, forKey: .friendlyName)
        try c.encode(amount, forKey: .amount)
        try c.encode(frequency, forKey: .frequency)
        if frequency == .recurring { try c.encode(interval, forKey: .interval) }
        try c.encode(APIClient.dayString(nextDueDate), forKey: .nextDueDate)
        try c.encode(endDate.map(APIClient.dayString), forKey: .endDate)
    }
}

extension Optional where Wrapped == String {
    /// nil when missing or only whitespace; otherwise the trimmed text.
    var nonEmptyTrimmed: String? {
        guard let text = self?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }
}

extension KeyedDecodingContainer {
    /// A "YYYY-MM-DD" string as the start of that day in the device calendar.
    func decodeDay(forKey key: Key) throws -> Date {
        let string = try decode(String.self, forKey: key)
        guard let date = APIClient.parseDay(string) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "Invalid day \(string)")
        }
        return date
    }

    func decodeDayIfPresent(forKey key: Key) throws -> Date? {
        guard let string = try decodeIfPresent(String.self, forKey: key) else { return nil }
        guard let date = APIClient.parseDay(string) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "Invalid day \(string)")
        }
        return date
    }
}
