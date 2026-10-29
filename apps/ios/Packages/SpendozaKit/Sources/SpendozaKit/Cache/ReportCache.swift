import Foundation

/// Locates the cache root shared by the report and profile caches.
func defaultCacheRoot() -> URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("SpendozaAccount", isDirectory: true)
}

/// The last reports the server returned, one JSON file per month under the signed-in user's own folder, so the
/// Health tab can show something offline. Holds financial data: files are protected while the phone is locked,
/// never shared between users, and `clear()` runs on sign-out.
public final class ReportCache: @unchecked Sendable {
    private let files: ScopedFiles

    /// `directory` defaults to a folder in the Caches directory (shared with `ProfileCache`).
    public init(directory: URL? = nil, scope: AccountScope) {
        files = ScopedFiles(root: directory ?? defaultCacheRoot(), scope: scope)
    }

    /// A cached report and when the app fetched it (what "Last updated" means).
    public struct Entry: Codable, Sendable {
        public let report: Report
        public let fetchedAt: Date

        enum CodingKeys: String, CodingKey { case report, fetchedAt = "fetched_at" }
    }

    private func name(for month: Month) -> String { "report-\(month.apiString).json" }

    /// Dropped when `token` is stale (the account changed or signed out since it was taken).
    public func store(_ report: Report, fetchedAt: Date, token: AccountScope.Token) {
        guard let data = try? JSONEncoder().encode(Entry(report: report, fetchedAt: fetchedAt)) else { return }
        files.write(data, name: name(for: report.month), token: token)
    }

    /// `nil` when nothing is cached for the month (or the file can't be read).
    public func entry(month: Month) -> Entry? {
        guard let data = files.read(name: name(for: month)) else { return nil }
        return try? JSONDecoder().decode(Entry.self, from: data)
    }

    public func load(month: Month) -> Report? { entry(month: month)?.report }

    /// Forgets a month the server no longer has a report for. Dropped when `token` is stale.
    public func remove(month: Month, token: AccountScope.Token) {
        files.remove(name: name(for: month), token: token)
    }

    public func clear() { files.removeAll() }
}

/// The last profile per user, so an offline launch can still pick the right phase.
public final class ProfileCache: @unchecked Sendable {
    private let files: ScopedFiles

    public init(directory: URL? = nil, scope: AccountScope) {
        files = ScopedFiles(root: directory ?? defaultCacheRoot(), scope: scope)
    }

    public func store(_ profile: Profile, token: AccountScope.Token) {
        guard let data = try? JSONEncoder().encode(profile) else { return }
        files.write(data, name: "profile.json", token: token)
    }

    public func load() -> Profile? {
        guard let data = files.read(name: "profile.json") else { return nil }
        return try? JSONDecoder().decode(Profile.self, from: data)
    }

    public func clear() { files.removeAll() }
}
