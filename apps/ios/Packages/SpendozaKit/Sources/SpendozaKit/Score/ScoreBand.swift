import Foundation

/// Low 0-39, Fair 40-69, Good 70-100.
public enum ScoreBand: Sendable, Equatable, Codable {
    case low, fair, good

    public init(score: Int) {
        switch score {
        case ..<40: self = .low
        case 40..<70: self = .fair
        default: self = .good
        }
    }

    public var name: String {
        switch self {
        case .low: "Low"
        case .fair: "Fair"
        case .good: "Good"
        }
    }
}
