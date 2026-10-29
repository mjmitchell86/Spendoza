import Foundation

/// The parts of `GET /api/profile` the app reads so far.
public struct Profile: Decodable, Sendable, Equatable {
    public let displayName: String?
    public let timezone: String?

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case timezone
    }
}
