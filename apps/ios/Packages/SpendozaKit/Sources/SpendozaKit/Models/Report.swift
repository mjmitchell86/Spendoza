import Foundation

/// A row of `GET /api/reports/personal`.
public struct Report: Codable, Sendable {
    public let month: Month
    public let data: ReportData
    /// `ai_insights` split into bullet lines; empty when null.
    public let insights: [String]
    public let generatedAt: Date

    enum CodingKeys: String, CodingKey {
        case month = "report_month"
        case data = "report_data"
        case insights = "ai_insights"
        case generatedAt = "generated_at"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        month = try c.decode(Month.self, forKey: .month)
        data = try c.decode(ReportData.self, forKey: .data)
        insights = Report.bulletLines(try c.decodeIfPresent(String.self, forKey: .insights))
        let stamp = try c.decode(String.self, forKey: .generatedAt)
        guard let date = Report.parseDate(stamp) else {
            throw DecodingError.dataCorruptedError(forKey: .generatedAt, in: c, debugDescription: "Invalid date \(stamp)")
        }
        generatedAt = date
    }

    /// Writes the same wire format the server sends, so a cached report decodes through `init(from:)`.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(month, forKey: .month)
        try c.encode(data, forKey: .data)
        if !insights.isEmpty {
            try c.encode(insights.map { "- \($0)" }.joined(separator: "\n"), forKey: .insights)
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        try c.encode(formatter.string(from: generatedAt), forKey: .generatedAt)
    }

    static func bulletLines(_ text: String?) -> [String] {
        guard let text else { return [] }
        let bullets: Set<Character> = ["-", "*", "\u{2022}"]
        return text.split(whereSeparator: \.isNewline).compactMap { line in
            var s = line.trimmingCharacters(in: .whitespaces)
            if let first = s.first, bullets.contains(first) {
                s.removeFirst()
                s = s.trimmingCharacters(in: .whitespaces)
            }
            return s.isEmpty ? nil : s
        }
    }

    static func parseDate(_ string: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: string) { return date }
        return ISO8601DateFormatter().date(from: string)
    }
}

public struct CategoryAmount: Codable, Sendable, Equatable {
    /// The category's name (the API keys by name, not id).
    public let category: String
    public let amount: Double
    public let percentage: Double?
}

public struct ReportData: Codable, Sendable {
    public let totalIncome: Double
    public let totalExpenses: Double
    /// Already a percentage (16.0 means 16%).
    public let savingsRate: Double
    public let byCategory: [CategoryAmount]
    public let health: HealthScore?

    enum CodingKeys: String, CodingKey {
        case totalIncome = "total_income"
        case totalExpenses = "total_expenses"
        case savingsRate = "savings_rate"
        case byCategory = "by_category"
        case health = "financial_health_score"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totalIncome = try c.decode(Double.self, forKey: .totalIncome)
        totalExpenses = try c.decode(Double.self, forKey: .totalExpenses)
        savingsRate = try c.decodeIfPresent(Double.self, forKey: .savingsRate) ?? 0
        byCategory = try c.decodeIfPresent([CategoryAmount].self, forKey: .byCategory) ?? []
        health = try c.decodeIfPresent(HealthScore.self, forKey: .health)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(totalIncome, forKey: .totalIncome)
        try c.encode(totalExpenses, forKey: .totalExpenses)
        try c.encode(savingsRate, forKey: .savingsRate)
        try c.encode(byCategory, forKey: .byCategory)
        try c.encodeIfPresent(health, forKey: .health)
    }
}

public enum Rating: String, Codable, Sendable {
    case good, ok, warning, critical
}

public struct PartScore: Codable, Sendable, Equatable {
    /// Percentage for savings/needs/wants, months for the emergency fund, a 0-1 ratio for debt vs. income.
    public let value: Double
    public let points: Int
    public let max: Int
    public let rating: Rating
}

public struct HealthScore: Codable, Sendable {
    public let score: Int
    public let previousScore: Int?
    public let parts: [ScorePart: PartScore]

    enum CodingKeys: String, CodingKey {
        case score
        case previousScore = "previous_score"
        case factors
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        score = Int(try c.decode(Double.self, forKey: .score).rounded())
        previousScore = try c.decodeIfPresent(Double.self, forKey: .previousScore).map { Int($0.rounded()) }
        let factors = try c.decode([String: PartScore].self, forKey: .factors)
        var parts: [ScorePart: PartScore] = [:]
        for (key, value) in factors {
            if let part = ScorePart(rawValue: key) { parts[part] = value }
        }
        self.parts = parts
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(score, forKey: .score)
        try c.encodeIfPresent(previousScore, forKey: .previousScore)
        try c.encode(Dictionary(uniqueKeysWithValues: parts.map { ($0.key.rawValue, $0.value) }), forKey: .factors)
    }

    public init(score: Int, previousScore: Int?, parts: [ScorePart: PartScore]) {
        self.score = score
        self.previousScore = previousScore
        self.parts = parts
    }
}
