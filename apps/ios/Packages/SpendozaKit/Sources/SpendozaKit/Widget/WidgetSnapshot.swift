import Foundation

/// The only data the home-screen widget may see: score, band, previous score and month.
public struct WidgetSnapshot: Codable, Equatable, Sendable {
    public let score: Int
    public let band: ScoreBand
    public let previousScore: Int?
    public let month: Month

    public init(score: Int, band: ScoreBand, previousScore: Int?, month: Month) {
        self.score = score
        self.band = band
        self.previousScore = previousScore
        self.month = month
    }
}

/// Stores the snapshot in the shared App Group defaults.
public final class SnapshotStore: Sendable {
    private static let key = "widgetSnapshot"
    private let appGroup: String

    public init(appGroup: String) {
        self.appGroup = appGroup
    }

    // UserDefaults is thread-safe; create per call so the class stays trivially Sendable.
    private var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    public func save(_ s: WidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        defaults?.set(data, forKey: Self.key)
    }

    public func clear() {
        defaults?.removeObject(forKey: Self.key)
    }

    public func load() -> WidgetSnapshot? {
        guard let data = defaults?.data(forKey: Self.key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }
}
