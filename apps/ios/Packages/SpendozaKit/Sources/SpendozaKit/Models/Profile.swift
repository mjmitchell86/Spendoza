import Foundation

/// `GET /api/profile` (the fields the app reads).
public struct Profile: Decodable, Sendable, Equatable {
    public let id: String
    public let displayName: String
    public let onboardingCompleted: Bool
    public let isAdmin: Bool
    public let emailReportsEnabled: Bool
    public let householdID: String?
    public let timezone: String?

    public init(id: String, displayName: String, onboardingCompleted: Bool, isAdmin: Bool,
                emailReportsEnabled: Bool, householdID: String?, timezone: String? = nil) {
        self.id = id
        self.displayName = displayName
        self.onboardingCompleted = onboardingCompleted
        self.isAdmin = isAdmin
        self.emailReportsEnabled = emailReportsEnabled
        self.householdID = householdID
        self.timezone = timezone
    }

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case onboardingCompleted = "onboarding_completed"
        case isAdmin = "is_admin"
        case emailReportsEnabled = "email_reports_enabled"
        case householdID = "household_id"
        case timezone
    }
}

/// Body of `PUT /api/profile`; nil fields are left out of the request.
public struct ProfileChange: Encodable, Sendable, Equatable {
    public var emailReportsEnabled: Bool?
    public var timezone: String?

    public init(emailReportsEnabled: Bool? = nil, timezone: String? = nil) {
        self.emailReportsEnabled = emailReportsEnabled
        self.timezone = timezone
    }

    enum CodingKeys: String, CodingKey {
        case emailReportsEnabled = "email_reports_enabled"
        case timezone
    }
}
