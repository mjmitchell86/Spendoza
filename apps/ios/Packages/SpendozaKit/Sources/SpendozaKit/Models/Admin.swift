import Foundation

/// Postgres bigint and numeric columns reach JSON as numbers or as numeric strings; this reads either.
struct FlexibleNumber: Decodable {
    let double: Double
    /// Averages arrive with decimals ("1000.5000"); whole-number fields round.
    var int: Int { Int(double.rounded()) }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let number = try? c.decode(Double.self) {
            double = number
        } else if let text = try? c.decode(String.self), let number = Double(text) {
            double = number
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Expected a number or a numeric string")
        }
    }
}

extension KeyedDecodingContainer {
    fileprivate func count(_ key: Key) throws -> Int { try decode(FlexibleNumber.self, forKey: key).int }
}

/// `GET /api/admin/stats`.
public struct AdminStats: Decodable, Sendable, Equatable {
    public let users: Users
    public let activity: Activity

    public init(users: Users, activity: Activity) {
        self.users = users
        self.activity = activity
    }

    public struct Users: Decodable, Sendable, Equatable {
        public let totalUsers, freeUsers, starterUsers, proUsers, adminUsers: Int

        public init(totalUsers: Int, freeUsers: Int, starterUsers: Int, proUsers: Int, adminUsers: Int) {
            self.totalUsers = totalUsers
            self.freeUsers = freeUsers
            self.starterUsers = starterUsers
            self.proUsers = proUsers
            self.adminUsers = adminUsers
        }

        enum CodingKeys: String, CodingKey {
            case totalUsers = "total_users", freeUsers = "free_users", starterUsers = "starter_users"
            case proUsers = "pro_users", adminUsers = "admin_users"
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            totalUsers = try c.count(.totalUsers)
            freeUsers = try c.count(.freeUsers)
            starterUsers = try c.count(.starterUsers)
            proUsers = try c.count(.proUsers)
            adminUsers = try c.count(.adminUsers)
        }
    }

    public struct Activity: Decodable, Sendable, Equatable {
        public let totalTransactions, totalReports, totalEmailsSent, totalGoals, totalHouseholds: Int

        public init(totalTransactions: Int, totalReports: Int, totalEmailsSent: Int, totalGoals: Int, totalHouseholds: Int) {
            self.totalTransactions = totalTransactions
            self.totalReports = totalReports
            self.totalEmailsSent = totalEmailsSent
            self.totalGoals = totalGoals
            self.totalHouseholds = totalHouseholds
        }

        enum CodingKeys: String, CodingKey {
            case totalTransactions = "total_transactions", totalReports = "total_reports"
            case totalEmailsSent = "total_emails_sent", totalGoals = "total_goals", totalHouseholds = "total_households"
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            totalTransactions = try c.count(.totalTransactions)
            totalReports = try c.count(.totalReports)
            totalEmailsSent = try c.count(.totalEmailsSent)
            totalGoals = try c.count(.totalGoals)
            totalHouseholds = try c.count(.totalHouseholds)
        }
    }
}

/// `GET /api/admin/stats/trends`.
public struct AdminTrends: Decodable, Sendable, Equatable {
    public let userTrends: [UserTrend]
    public let activityTrends: [ActivityTrend]
    public let llmStats: [LLMStat]

    public init(userTrends: [UserTrend], activityTrends: [ActivityTrend], llmStats: [LLMStat]) {
        self.userTrends = userTrends
        self.activityTrends = activityTrends
        self.llmStats = llmStats
    }

    enum CodingKeys: String, CodingKey {
        case userTrends = "user_trends", activityTrends = "activity_trends", llmStats = "llm_stats"
    }

    public struct UserTrend: Decodable, Sendable, Equatable {
        public let month: String
        public let newUsers: Int

        public init(month: String, newUsers: Int) {
            self.month = month
            self.newUsers = newUsers
        }

        enum CodingKeys: String, CodingKey { case month, newUsers = "new_users" }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            month = try c.decode(String.self, forKey: .month)
            newUsers = try c.count(.newUsers)
        }
    }

    public struct ActivityTrend: Decodable, Sendable, Equatable {
        public let month: String
        public let metric: String
        public let count: Int

        public init(month: String, metric: String, count: Int) {
            self.month = month
            self.metric = metric
            self.count = count
        }

        enum CodingKeys: String, CodingKey { case month, metric, count }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            month = try c.decode(String.self, forKey: .month)
            metric = try c.decode(String.self, forKey: .metric)
            count = try c.count(.count)
        }
    }

    public struct LLMStat: Decodable, Sendable, Equatable {
        public let month: String
        public let callType: String
        public let callCount, totalTokens, avgTokens, minTokens, maxTokens: Int
        /// nil when the model has no price on file.
        public let totalCost: Double?

        public init(month: String, callType: String, callCount: Int, totalTokens: Int, avgTokens: Int,
                    minTokens: Int, maxTokens: Int, totalCost: Double?) {
            self.month = month
            self.callType = callType
            self.callCount = callCount
            self.totalTokens = totalTokens
            self.avgTokens = avgTokens
            self.minTokens = minTokens
            self.maxTokens = maxTokens
            self.totalCost = totalCost
        }

        enum CodingKeys: String, CodingKey {
            case month, callType = "call_type", callCount = "call_count", totalTokens = "total_tokens"
            case avgTokens = "avg_tokens", minTokens = "min_tokens", maxTokens = "max_tokens", totalCost = "total_cost"
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            month = try c.decode(String.self, forKey: .month)
            callType = try c.decode(String.self, forKey: .callType)
            callCount = try c.count(.callCount)
            totalTokens = try c.count(.totalTokens)
            avgTokens = try c.count(.avgTokens)
            minTokens = try c.count(.minTokens)
            maxTokens = try c.count(.maxTokens)
            totalCost = try c.decodeIfPresent(FlexibleNumber.self, forKey: .totalCost)?.double
        }
    }
}

/// One row of `GET /api/admin/users`.
public struct AdminUser: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let displayName: String
    public let email: String?
    public let tier: String
    public let isAdmin: Bool
    public let disabled: Bool
    public let createdAt: Date

    public init(id: String, displayName: String, email: String?, tier: String, isAdmin: Bool, disabled: Bool, createdAt: Date) {
        self.id = id
        self.displayName = displayName
        self.email = email
        self.tier = tier
        self.isAdmin = isAdmin
        self.disabled = disabled
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case id, email, disabled
        case displayName = "display_name"
        case tier = "subscription_tier"
        case isAdmin = "is_admin"
        case createdAt = "created_at"
    }
}

public struct AdminUserPage: Decodable, Sendable, Equatable {
    public let users: [AdminUser]
    public let total, page, limit: Int

    public init(users: [AdminUser], total: Int, page: Int, limit: Int) {
        self.users = users
        self.total = total
        self.page = page
        self.limit = limit
    }

    enum CodingKeys: String, CodingKey { case users, total, page, limit }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        users = try c.decode([AdminUser].self, forKey: .users)
        total = try c.count(.total)
        page = try c.count(.page)
        limit = try c.count(.limit)
    }
}

/// Which page of users to list. Empty `search` and `tier` are left out of the request.
public struct AdminUserQuery: Sendable, Equatable {
    public var page: Int
    public var limit: Int
    public var search: String?
    public var tier: String?

    public init(page: Int = 1, limit: Int = 25, search: String? = nil, tier: String? = nil) {
        self.page = page
        self.limit = limit
        self.search = search
        self.tier = tier
    }

    var queryItems: [URLQueryItem] {
        var items = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "limit", value: String(limit))]
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        if let tier, !tier.isEmpty { items.append(URLQueryItem(name: "tier", value: tier)) }
        return items
    }
}

/// `PATCH /api/admin/users/:id`. Only the keys that are set are sent.
public struct AdminUserChange: Encodable, Sendable, Equatable {
    public var isAdmin: Bool?
    public var tier: String?
    public var disabled: Bool?

    public init(isAdmin: Bool? = nil, tier: String? = nil, disabled: Bool? = nil) {
        self.isAdmin = isAdmin
        self.tier = tier
        self.disabled = disabled
    }

    enum CodingKeys: String, CodingKey {
        case isAdmin = "is_admin", tier = "subscription_tier", disabled
    }
}
