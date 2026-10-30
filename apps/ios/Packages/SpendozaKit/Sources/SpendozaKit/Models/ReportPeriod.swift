import Foundation

/// What a PDF report covers: one month, or a run of months.
public enum ReportPeriod: Hashable, Sendable {
    case month(Month)
    case range(from: Month, to: Month)

    /// The report export's query string.
    var query: [URLQueryItem] {
        switch self {
        case .month(let month):
            return [URLQueryItem(name: "month", value: month.apiString)]
        case .range(let from, let to):
            return [URLQueryItem(name: "from_date", value: from.apiString),
                    URLQueryItem(name: "to_date", value: to.lastDayString)]
        }
    }
}

/// A downloaded PDF and the name to save it under.
public struct PDFFile: Sendable, Equatable {
    public let data: Data
    public let filename: String

    public init(data: Data, filename: String) {
        self.data = data
        self.filename = filename
    }

    static let defaultFilename = "spendoza-report.pdf"

    /// The `filename` from a `Content-Disposition` header. A name with a path separator is not trusted.
    static func filename(fromContentDisposition header: String?) -> String {
        guard let header, let range = header.range(of: "filename=") else { return defaultFilename }
        let name = header[range.upperBound...]
            .prefix { $0 != ";" }
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"").union(.whitespaces))
        return name.isEmpty || name.contains("/") ? defaultFilename : name
    }
}

extension Month {
    /// "2026-10-31": the last day of this month, as the reports API takes a range's end.
    var lastDayString: String {
        let calendar = Calendar(identifier: .gregorian)
        let first = calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date(timeIntervalSince1970: 0)
        let days = calendar.range(of: .day, in: .month, for: first)?.count ?? 28
        return String(format: "%04d-%02d-%02d", year, month, days)
    }
}
