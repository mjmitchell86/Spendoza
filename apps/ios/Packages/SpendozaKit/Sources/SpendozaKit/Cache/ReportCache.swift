import Foundation

/// The last reports the server returned, one JSON file per month, so the Health tab can show something offline.
/// Holds financial data: `clear()` runs on sign-out so the next account never sees it.
public final class ReportCache: @unchecked Sendable {
    private let directory: URL
    private let lock = NSLock()

    /// `directory` defaults to a folder in the Caches directory.
    public init(directory: URL? = nil) {
        self.directory = directory
            ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("SpendozaReports", isDirectory: true)
    }

    private func file(for month: Month) -> URL {
        directory.appendingPathComponent("report-\(month.apiString).json")
    }

    public func store(_ report: Report) {
        lock.lock()
        defer { lock.unlock() }
        guard let data = try? JSONEncoder().encode(report) else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: file(for: report.month), options: .atomic)
    }

    /// `nil` when nothing is cached for the month (or the file can't be read).
    public func load(month: Month) -> Report? {
        lock.lock()
        defer { lock.unlock() }
        guard let data = try? Data(contentsOf: file(for: month)) else { return nil }
        return try? JSONDecoder().decode(Report.self, from: data)
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        try? FileManager.default.removeItem(at: directory)
    }
}
