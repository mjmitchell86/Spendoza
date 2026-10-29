import Foundation

public final class APIClient: SpendozaAPI {
    /// Measured (Task 6): the largest unauthenticated multipart body test-api accepted was 4,493,164 bytes (4,494,140 got 413).
    /// The file limit leaves 13 KB for multipart framing and the optional bank_name/account_label fields, 8 KB more than they need.
    public static let maxStatementBytes = 4_480_000
    /// The limit in whole megabytes, rounded down. Uses MiB (the larger unit) so the figure never overstates the limit.
    public static let maxStatementMB = max(1, maxStatementBytes / 1_048_576)

    private let baseURL: URL
    private let session: URLSession
    private let accessToken: @Sendable () async -> String?

    public init(baseURL: URL, session: URLSession = .shared, accessToken: @escaping @Sendable () async -> String?) {
        self.baseURL = baseURL
        self.session = session
        self.accessToken = accessToken
    }

    // MARK: SpendozaAPI

    public func profile() async throws -> Profile { try await send(.profile) }

    public func completeOnboarding() async throws { try await sendIgnoringBody(.onboarding) }

    public func updateProfile(_ change: ProfileChange) async throws -> Profile {
        try await send(.json(.put, "/api/profile", change))
    }

    public func personalReport(_ month: Month) async throws -> Report? {
        guard let data = try await perform(.personalReport(month), notFoundIsNil: true) else { return nil }
        return try decode(Report.self, from: data)
    }

    public func categories() async throws -> [BudgetCategory] { try await send(.categories) }

    public func transactions(from: Date, to: Date) async throws -> [Transaction] {
        try await send(.transactions(from: Self.dayString(from), to: Self.dayString(to)))
    }

    public func setCategory(transactionID: String, category: String) async throws {
        try await sendIgnoringBody(.setCategory(id: transactionID, category: category))
    }

    public func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws {
        try await sendIgnoringBody(.budgetGoal(name: name, categoryID: categoryID, amount: amount))
    }

    public func uploadStatement(fileURL: URL, mimeType: String) async throws -> Statement {
        let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if size > Self.maxStatementBytes { throw APIError.fileTooLarge(maxMB: Self.maxStatementMB) }
        let fileData = try Data(contentsOf: fileURL)
        if fileData.count > Self.maxStatementBytes { throw APIError.fileTooLarge(maxMB: Self.maxStatementMB) }

        let boundary = "spendoza-\(UUID().uuidString)"
        var body = Data()
        func add(_ text: String) { body.append(Data(text.utf8)) }
        let filename = fileURL.lastPathComponent.replacingOccurrences(of: "\"", with: "'")
        add("--\(boundary)\r\n")
        add("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        add("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        add("\r\n--\(boundary)--\r\n")

        var endpoint = Endpoint(method: .post, path: Endpoint.uploadPath)
        endpoint.body = body
        let data = try await perform(endpoint, contentType: "multipart/form-data; boundary=\(boundary)")
        return try decode(Statement.self, from: data)
    }

    public func statements() async throws -> [Statement] { try await send(.statements) }

    public func reprocessStatement(id: String) async throws { try await sendIgnoringBody(.reprocess(id: id)) }

    public func removeStatement(id: String) async throws { try await sendIgnoringBody(.remove(id: id)) }

    public func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws {
        try await sendIgnoringBody(.signUp(email: email, password: password, displayName: displayName, inviteCode: inviteCode))
    }

    public func joinWaitlist(name: String, email: String) async throws {
        try await sendIgnoringBody(.waitlist(name: name, email: email))
    }

    // MARK: Transport

    private func send<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        try decode(T.self, from: try await perform(endpoint))
    }

    private func sendIgnoringBody(_ endpoint: Endpoint) async throws {
        _ = try await perform(endpoint)
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try APICoding.makeDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.message("Spendoza sent a response the app couldn't read.")
        }
    }

    private func perform(_ endpoint: Endpoint, contentType: String? = nil) async throws -> Data {
        // With notFoundIsNil false this never returns nil.
        try await perform(endpoint, contentType: contentType, notFoundIsNil: false) ?? Data()
    }

    private func perform(_ endpoint: Endpoint, contentType: String? = nil, notFoundIsNil: Bool) async throws -> Data? {
        var token: String?
        if endpoint.requiresAuth {
            token = await accessToken()
            guard token != nil else { throw APIError.unauthorized }
        }

        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.message("Spendoza's address is invalid.")
        }
        components.path = (components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path) + endpoint.path
        if !endpoint.query.isEmpty { components.queryItems = endpoint.query }
        guard let url = components.url else { throw APIError.message("Spendoza's address is invalid.") }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body = endpoint.body {
            request.httpBody = body
            request.setValue(contentType ?? "application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut: throw APIError.offline
            case .cancelled: throw error
            default: throw APIError.message("Couldn't reach Spendoza. Try again.")
            }
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) { return data }
        if status == 404, notFoundIsNil { return nil }
        throw Self.error(status: status, data: data)
    }

    static func error(status: Int, data: Data) -> APIError {
        struct Body: Decodable {
            let error: String?
            let requiredTier: String?
            enum CodingKeys: String, CodingKey { case error, requiredTier = "required_tier" }
        }
        let body = try? JSONDecoder().decode(Body.self, from: data)
        switch status {
        case 401: return .unauthorized
        case 403: if let tier = body?.requiredTier { return .notOnPlan(requiredTier: tier) }
        case 413: return .fileTooLarge(maxMB: maxStatementMB)
        default: break
        }
        if let text = body?.error, !text.isEmpty { return .message(text) }
        return .message("Something went wrong. Try again.")
    }

    /// "YYYY-MM-DD" in the device calendar, the way the API filters transactions.
    static func dayString(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
    }
}
