import Foundation

/// Pure geometry for the engraved health dial: a half gauge sweeping from the left (score 0) to the right (score 100).
public enum DialGeometry {
    /// The needle angle in degrees, measured from the right-hand end of the dial: 0 → 180, 50 → 90, 100 → 0.
    /// Scores outside 0...100 are clamped.
    public static func angle(forScore score: Int) -> Double {
        180 - Double(clamped(score)) * 1.8
    }

    /// The three band arcs, in dial order. Matches `ScoreBand(score:)`.
    public static let bandStops: [(ScoreBand, ClosedRange<Int>)] = [
        (.low, 0...39),
        (.fair, 40...69),
        (.good, 70...100),
    ]

    static func clamped(_ score: Int) -> Int { min(max(score, 0), 100) }
}

/// "Health score 64 of 100, Fair, down 9 since September." The comparison is omitted when there is no previous score.
public func dialAccessibilityLabel(score: Int, previous: Int?, month: Month) -> String {
    let score = DialGeometry.clamped(score)
    var label = "Health score \(score) of 100, \(ScoreBand(score: score).name)"
    if let previous {
        let delta = score - DialGeometry.clamped(previous)
        let since = month.previous.name
        if delta == 0 {
            label += ", same as \(since)"
        } else {
            label += ", \(delta < 0 ? "down" : "up") \(abs(delta)) since \(since)"
        }
    }
    return label + "."
}
