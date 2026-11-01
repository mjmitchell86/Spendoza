import Foundation

public enum IncomeFrequency: String, Codable, Sendable, CaseIterable {
    case oneTime = "one_time"
    case weekly, biweekly, monthly, annually
}

/// A row of `GET /api/income`. Dates are the API's "YYYY-MM-DD", read in the device calendar.
public struct IncomeEntry: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    /// Whose entry it is (`user_id`); a household member's shared entry has someone else's.
    public let ownerID: String
    public let sourceName: String
    public let friendlyName: String?
    public let amount: Double
    public let frequency: IncomeFrequency
    public let effectiveDate: Date
    public let endDate: Date?
    public let attributedToUserID: String?
    public let attributedToName: String?
    public let autoDetected: Bool
    public let aiSuggested: Bool

    public init(id: String, ownerID: String, sourceName: String, friendlyName: String? = nil, amount: Double,
                frequency: IncomeFrequency, effectiveDate: Date, endDate: Date? = nil, attributedToUserID: String? = nil,
                attributedToName: String? = nil, autoDetected: Bool = false, aiSuggested: Bool = false) {
        self.id = id
        self.ownerID = ownerID
        self.sourceName = sourceName
        self.friendlyName = friendlyName
        self.amount = amount
        self.frequency = frequency
        self.effectiveDate = effectiveDate
        self.endDate = endDate
        self.attributedToUserID = attributedToUserID
        self.attributedToName = attributedToName
        self.autoDetected = autoDetected
        self.aiSuggested = aiSuggested
    }

    enum CodingKeys: String, CodingKey {
        case id, amount, frequency
        case ownerID = "user_id"
        case sourceName = "source_name"
        case friendlyName = "friendly_name"
        case effectiveDate = "effective_date"
        case endDate = "end_date"
        case attributedToUserID = "attributed_to_user_id"
        case attributedToName = "attributed_to_name"
        case autoDetected = "auto_detected"
        case aiSuggested = "is_ai_suggested"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        ownerID = try c.decode(String.self, forKey: .ownerID)
        sourceName = try c.decode(String.self, forKey: .sourceName)
        friendlyName = try c.decodeIfPresent(String.self, forKey: .friendlyName)
        amount = try c.decode(Double.self, forKey: .amount)
        frequency = try c.decode(IncomeFrequency.self, forKey: .frequency)
        effectiveDate = try c.decodeDay(forKey: .effectiveDate)
        endDate = try c.decodeDayIfPresent(forKey: .endDate)
        attributedToUserID = try c.decodeIfPresent(String.self, forKey: .attributedToUserID)
        attributedToName = try c.decodeIfPresent(String.self, forKey: .attributedToName)
        autoDetected = try c.decodeIfPresent(Bool.self, forKey: .autoDetected) ?? false
        aiSuggested = try c.decodeIfPresent(Bool.self, forKey: .aiSuggested) ?? false
    }
}

/// The body of a create or update. Empty optional fields go as explicit nulls so an update clears them.
public struct IncomeDraft: Encodable, Sendable, Equatable {
    public var sourceName: String
    public var friendlyName: String?
    public var amount: Double
    public var frequency: IncomeFrequency
    public var effectiveDate: Date
    public var endDate: Date?
    public var attributedToUserID: String?
    public var attributedToName: String?

    public init(sourceName: String, friendlyName: String? = nil, amount: Double, frequency: IncomeFrequency,
                effectiveDate: Date, endDate: Date? = nil, attributedToUserID: String? = nil, attributedToName: String? = nil) {
        self.sourceName = sourceName
        self.friendlyName = friendlyName
        self.amount = amount
        self.frequency = frequency
        self.effectiveDate = effectiveDate
        self.endDate = endDate
        self.attributedToUserID = attributedToUserID
        self.attributedToName = attributedToName
    }

    enum CodingKeys: String, CodingKey {
        case amount, frequency
        case sourceName = "source_name"
        case friendlyName = "friendly_name"
        case effectiveDate = "effective_date"
        case endDate = "end_date"
        case attributedToUserID = "attributed_to_user_id"
        case attributedToName = "attributed_to_name"
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(sourceName, forKey: .sourceName)
        try c.encode(friendlyName.nonEmptyTrimmed, forKey: .friendlyName)
        try c.encode(amount, forKey: .amount)
        try c.encode(frequency, forKey: .frequency)
        try c.encode(APIClient.dayString(effectiveDate), forKey: .effectiveDate)
        try c.encode(endDate.map(APIClient.dayString), forKey: .endDate)
        try c.encode(attributedToUserID, forKey: .attributedToUserID)
        try c.encode(attributedToName.nonEmptyTrimmed, forKey: .attributedToName)
    }
}
