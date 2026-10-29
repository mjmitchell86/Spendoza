import Foundation

/// A calendar month, as the reports API keys them ("2026-10-01").
public struct Month: Hashable, Comparable, Codable, Sendable {
    public let year: Int
    public let month: Int

    public init(year: Int, month: Int) {
        self.year = year
        self.month = month
    }

    public init(date: Date, calendar: Calendar) {
        let parts = calendar.dateComponents([.year, .month], from: date)
        self.init(year: parts.year ?? 1970, month: parts.month ?? 1)
    }

    /// Parses "YYYY-MM-DD" (the day is ignored). Returns nil for anything else.
    public init?(apiString: String) {
        let parts = apiString.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), (1...12).contains(month)
        else { return nil }
        self.init(year: year, month: month)
    }

    /// "2026-10-01"
    public var apiString: String {
        String(format: "%04d-%02d-01", year, month)
    }

    public var previous: Month {
        month == 1 ? Month(year: year - 1, month: 12) : Month(year: year, month: month - 1)
    }

    /// "October" (fixed English, independent of the device locale).
    public var name: String {
        let names = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]
        return names.indices.contains(month - 1) ? names[month - 1] : ""
    }

    public static func < (lhs: Month, rhs: Month) -> Bool {
        (lhs.year, lhs.month) < (rhs.year, rhs.month)
    }

    public init(from decoder: Decoder) throws {
        let string = try decoder.singleValueContainer().decode(String.self)
        guard let month = Month(apiString: string) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid month \(string)"))
        }
        self = month
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(apiString)
    }
}
