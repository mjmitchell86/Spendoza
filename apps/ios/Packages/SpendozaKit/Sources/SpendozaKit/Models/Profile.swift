import Foundation

/// `GET /api/profile` (the fields the app reads).
public struct Profile: Codable, Sendable, Equatable {
    public let id: String
    public let displayName: String
    public let onboardingCompleted: Bool
    public let isAdmin: Bool
    public let emailReportsEnabled: Bool
    public let householdID: String?
    public let timezone: String?
    public let avatarURL: URL?
    public let emailReportDay: Weekday
    public let emailReportHour: Int
    public let subscriptionTier: String
    public let createdAt: Date?

    public init(id: String, displayName: String, onboardingCompleted: Bool, isAdmin: Bool,
                emailReportsEnabled: Bool, householdID: String?, timezone: String? = nil,
                avatarURL: URL? = nil, emailReportDay: Weekday = .saturday, emailReportHour: Int = 9,
                subscriptionTier: String = "free", createdAt: Date? = nil) {
        self.id = id
        self.displayName = displayName
        self.onboardingCompleted = onboardingCompleted
        self.isAdmin = isAdmin
        self.emailReportsEnabled = emailReportsEnabled
        self.householdID = householdID
        self.timezone = timezone
        self.avatarURL = avatarURL
        self.emailReportDay = emailReportDay
        self.emailReportHour = emailReportHour
        self.subscriptionTier = subscriptionTier
        self.createdAt = createdAt
    }

    /// A response that leaves out the report schedule or tier gets the server's defaults.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayName = try c.decode(String.self, forKey: .displayName)
        onboardingCompleted = try c.decode(Bool.self, forKey: .onboardingCompleted)
        isAdmin = try c.decode(Bool.self, forKey: .isAdmin)
        emailReportsEnabled = try c.decode(Bool.self, forKey: .emailReportsEnabled)
        householdID = try c.decodeIfPresent(String.self, forKey: .householdID)
        timezone = try c.decodeIfPresent(String.self, forKey: .timezone)
        avatarURL = try c.decodeIfPresent(URL.self, forKey: .avatarURL)
        emailReportDay = try c.decodeIfPresent(Weekday.self, forKey: .emailReportDay) ?? .saturday
        emailReportHour = try c.decodeIfPresent(Int.self, forKey: .emailReportHour) ?? 9
        subscriptionTier = try c.decodeIfPresent(String.self, forKey: .subscriptionTier) ?? "free"
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
    }

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case onboardingCompleted = "onboarding_completed"
        case isAdmin = "is_admin"
        case emailReportsEnabled = "email_reports_enabled"
        case householdID = "household_id"
        case timezone
        case avatarURL = "avatar_url"
        case emailReportDay = "email_report_day"
        case emailReportHour = "email_report_hour"
        case subscriptionTier = "subscription_tier"
        case createdAt = "created_at"
    }
}

public enum Weekday: String, Codable, CaseIterable, Sendable {
    case monday, tuesday, wednesday, thursday, friday, saturday, sunday

    /// "Monday"
    public var title: String { rawValue.capitalized }
}

/// Body of `PUT /api/profile`; nil fields are left out of the request.
public struct ProfileChange: Encodable, Sendable, Equatable {
    public var emailReportsEnabled: Bool?
    public var timezone: String?
    public var displayName: String?
    public var emailReportDay: Weekday?
    public var emailReportHour: Int?

    public init(emailReportsEnabled: Bool? = nil, timezone: String? = nil, displayName: String? = nil,
                emailReportDay: Weekday? = nil, emailReportHour: Int? = nil) {
        self.emailReportsEnabled = emailReportsEnabled
        self.timezone = timezone
        self.displayName = displayName
        self.emailReportDay = emailReportDay
        self.emailReportHour = emailReportHour
    }

    enum CodingKeys: String, CodingKey {
        case emailReportsEnabled = "email_reports_enabled"
        case timezone
        case displayName = "display_name"
        case emailReportDay = "email_report_day"
        case emailReportHour = "email_report_hour"
    }
}
