import Foundation

public struct PartChange: Sendable, Equatable {
    public let part: ScorePart
    public let points: Int
    public let max: Int
    /// Points gained or lost since the previous month; nil when there is nothing to compare.
    public let delta: Int?
}

/// One entry per part present in `current`, in `ScorePart.allCases` order.
public func partChanges(current: HealthScore, previous: HealthScore?) -> [PartChange] {
    ScorePart.allCases.compactMap { part in
        guard let now = current.parts[part] else { return nil }
        let delta = previous?.parts[part].map { now.points - $0.points }
        return PartChange(part: part, points: now.points, max: now.max, delta: delta)
    }
}
