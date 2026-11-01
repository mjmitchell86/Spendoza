import Foundation

public enum IncomeSharing: String, Codable, Sendable, CaseIterable {
    case all, none, partial

    /// A mode this version does not know yet reads as `none`, the most private: a blind save must never widen sharing.
    /// (An absent key is the server default, `all`; callers handle that.)
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = IncomeSharing(rawValue: raw) ?? .none
    }
}

public enum ExpenseSharing: String, Codable, Sendable, CaseIterable {
    case all, none, category

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ExpenseSharing(rawValue: raw) ?? .none
    }
}

/// A household member as listed by `GET /api/household`. Unordered on the server; sort when showing.
public struct Member: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let displayName: String
    public let incomeSharing: IncomeSharing
    public let expenseSharing: ExpenseSharing

    public init(id: String, displayName: String, incomeSharing: IncomeSharing = .all, expenseSharing: ExpenseSharing = .all) {
        self.id = id
        self.displayName = displayName
        self.incomeSharing = incomeSharing
        self.expenseSharing = expenseSharing
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayName = try c.decode(String.self, forKey: .displayName)
        incomeSharing = try c.decodeIfPresent(IncomeSharing.self, forKey: .incomeSharing) ?? .all
        expenseSharing = try c.decodeIfPresent(ExpenseSharing.self, forKey: .expenseSharing) ?? .all
    }

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case incomeSharing = "income_sharing_mode"
        case expenseSharing = "expense_sharing_mode"
    }
}

/// `GET /api/household`: `{household, members}`.
public struct Household: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let headID: String
    /// The raw (lowercase) code. Only the head gets it, and only while a code exists.
    public let inviteCode: String?
    public let members: [Member]

    public init(id: String, name: String, headID: String, inviteCode: String? = nil, members: [Member] = []) {
        self.id = id
        self.name = name
        self.headID = headID
        self.inviteCode = inviteCode
        self.members = members
    }

    public init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: RootKeys.self)
        let row = try root.nestedContainer(keyedBy: RowKeys.self, forKey: .household)
        id = try row.decode(String.self, forKey: .id)
        name = try row.decode(String.self, forKey: .name)
        headID = try row.decode(String.self, forKey: .headID)
        inviteCode = try row.decodeIfPresent(String.self, forKey: .inviteCode)
        members = try root.decodeIfPresent([Member].self, forKey: .members) ?? []
    }

    enum RootKeys: String, CodingKey { case household, members }
    enum RowKeys: String, CodingKey {
        case id, name
        case headID = "head_of_household_id"
        case inviteCode = "invite_code"
    }
}

/// A sent invitation still waiting (`GET /api/household/invitations`, head only).
public struct PendingInvitation: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let email: String
    public let createdAt: Date
    public let expiresAt: Date

    public init(id: String, email: String, createdAt: Date, expiresAt: Date) {
        self.id = id
        self.email = email
        self.createdAt = createdAt
        self.expiresAt = expiresAt
    }

    enum CodingKeys: String, CodingKey {
        case id, email
        case createdAt = "created_at"
        case expiresAt = "expires_at"
    }
}

/// An invitation to the signed-in user. It carries no code: the person types it from the email.
public struct MyInvitation: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let householdName: String
    public let inviterName: String
    public let expiresAt: Date

    public init(id: String, householdName: String, inviterName: String, expiresAt: Date) {
        self.id = id
        self.householdName = householdName
        self.inviterName = inviterName
        self.expiresAt = expiresAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdName = "household_name"
        case inviterName = "inviter_name"
        case expiresAt = "expires_at"
    }
}

/// Body of `PUT /api/household/sharing`. All three keys are always sent; the amount is null unless income is partial.
public struct SharingChange: Encodable, Sendable, Equatable {
    public var income: IncomeSharing
    public var sharedIncomeAmount: Double?
    public var expense: ExpenseSharing

    public init(income: IncomeSharing, sharedIncomeAmount: Double? = nil, expense: ExpenseSharing) {
        self.income = income
        self.sharedIncomeAmount = sharedIncomeAmount
        self.expense = expense
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(income, forKey: .income)
        try c.encode(income == .partial ? sharedIncomeAmount : nil, forKey: .sharedIncomeAmount)
        try c.encode(expense, forKey: .expense)
    }

    enum CodingKeys: String, CodingKey {
        case income = "income_sharing_mode"
        case sharedIncomeAmount = "shared_income_amount"
        case expense = "expense_sharing_mode"
    }
}

/// What sign-up reports about an invite or invitation code that was entered.
public struct SignUpResult: Decodable, Sendable, Equatable {
    public let joinedHousehold: Bool
    public let householdFull: Bool
    public let householdNotOnPlan: Bool

    public init(joinedHousehold: Bool = false, householdFull: Bool = false, householdNotOnPlan: Bool = false) {
        self.joinedHousehold = joinedHousehold
        self.householdFull = householdFull
        self.householdNotOnPlan = householdNotOnPlan
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        joinedHousehold = try c.decodeIfPresent(Bool.self, forKey: .joinedHousehold) ?? false
        householdFull = try c.decodeIfPresent(Bool.self, forKey: .householdFull) ?? false
        householdNotOnPlan = try c.decodeIfPresent(Bool.self, forKey: .householdNotOnPlan) ?? false
    }

    enum CodingKeys: String, CodingKey {
        case joinedHousehold = "joined_household"
        case householdFull = "household_full"
        case householdNotOnPlan = "household_not_on_plan"
    }
}
