import Foundation

/// One of the signed-in user's invite codes (`GET /api/invite-codes`).
public struct InviteCode: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let code: String
    public let usedAt: Date?
    public let createdAt: Date
    /// Who used it. The server sets this with `usedAt`, but either one means the code is spent.
    private let usedBy: String?

    public init(id: String, code: String, usedAt: Date? = nil, createdAt: Date, usedBy: String? = nil) {
        self.id = id
        self.code = code
        self.usedAt = usedAt
        self.createdAt = createdAt
        self.usedBy = usedBy
    }

    public var isUsed: Bool { usedAt != nil || usedBy != nil }

    enum CodingKeys: String, CodingKey {
        case id, code
        case usedAt = "used_at"
        case createdAt = "created_at"
        case usedBy = "used_by"
    }
}
