import Foundation

enum HTTPMethod: String { case get = "GET", post = "POST", put = "PUT", delete = "DELETE" }

/// One API call: method, path, query and (optionally) a JSON body.
struct Endpoint {
    var method: HTTPMethod
    var path: String
    var query: [URLQueryItem] = []
    var body: Data?
    /// Sign-up and waitlist run before the user has a session.
    var requiresAuth = true

    static func get(_ path: String, query: [URLQueryItem] = []) -> Endpoint {
        Endpoint(method: .get, path: path, query: query)
    }

    static func json(_ method: HTTPMethod, _ path: String, _ body: some Encodable, requiresAuth: Bool = true) -> Endpoint {
        Endpoint(method: method, path: path, body: try? JSONEncoder().encode(body), requiresAuth: requiresAuth)
    }

    static let profile = Endpoint.get("/api/profile")
    static let onboarding = Endpoint(method: .put, path: "/api/profile/onboarding")
    static let categories = Endpoint.get("/api/categories")
    static let statements = Endpoint.get("/api/bank-statements")
    static let uploadPath = "/api/bank-statements/upload"

    static func personalReport(_ month: Month) -> Endpoint {
        .get("/api/reports/personal", query: [URLQueryItem(name: "month", value: month.apiString)])
    }

    static func personalReportPDF(_ period: ReportPeriod) -> Endpoint {
        .get("/api/reports/export/personal", query: period.query)
    }

    static let avatarPath = "/api/profile/avatar"
    static let signOutOthers = Endpoint(method: .post, path: "/api/profile/sign-out-others")
    static let deleteAccount = Endpoint.json(.delete, "/api/profile", ["confirm": "DELETE"])
    static let inviteCodes = Endpoint.get("/api/invite-codes")
    static let createInviteCode = Endpoint.json(.post, "/api/invite-codes", [String: String]())
    static let sendTestEmail = Endpoint(method: .post, path: "/api/emails/send-test")

    static func transactions(from: String, to: String) -> Endpoint {
        .get("/api/transactions", query: [URLQueryItem(name: "from_date", value: from), URLQueryItem(name: "to_date", value: to)])
    }

    static func transactions(statementID: String) -> Endpoint {
        .get("/api/transactions", query: [URLQueryItem(name: "bank_statement_id", value: statementID)])
    }

    static func setCategory(id: String, category: String?) -> Endpoint {
        struct Body: Encodable {
            let category: String?
            enum CodingKeys: String, CodingKey { case category = "ai_category" }
            // An explicit null clears the category (the web sends the same); the key is never omitted.
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(category, forKey: .category)
            }
        }
        return .json(.put, "/api/transactions/\(id)", Body(category: category))
    }

    static func budgetGoal(name: String, categoryID: String, amount: Int) -> Endpoint {
        struct Body: Encodable {
            let name: String
            let goalType = "budget"
            let categoryID: String
            let targetAmount: Int
            enum CodingKeys: String, CodingKey {
                case name
                case goalType = "goal_type"
                case categoryID = "category_id"
                case targetAmount = "target_amount"
            }
        }
        return .json(.post, "/api/goals", Body(name: name, categoryID: categoryID, targetAmount: amount))
    }

    static func reprocess(id: String) -> Endpoint { Endpoint(method: .post, path: "/api/bank-statements/\(id)/reprocess") }
    static func remove(id: String) -> Endpoint { Endpoint(method: .delete, path: "/api/bank-statements/\(id)") }

    static func signUp(email: String, password: String, displayName: String, inviteCode: String) -> Endpoint {
        .json(.post, "/api/auth/signup",
              ["email": email, "password": password, "display_name": displayName,
               // Codes are matched exactly by the server: trim whitespace, never change case.
               "invite_code": inviteCode.trimmingCharacters(in: .whitespacesAndNewlines)],
              requiresAuth: false)
    }

    static func waitlist(name: String, email: String) -> Endpoint {
        .json(.post, "/api/auth/waitlist", ["name": name, "email": email], requiresAuth: false)
    }
}

enum APICoding {
    /// One decoder configuration for every response. Models spell their own `CodingKeys`, so no key strategy.
    /// Dates accept ISO-8601 with or without fractional seconds.
    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            guard let date = Report.parseDate(string) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid date \(string)"))
            }
            return date
        }
        return decoder
    }
}
