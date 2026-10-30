import Foundation

public final class APIClient: SpendozaAPI {
    /// Measured (Task 6): the largest unauthenticated multipart body test-api accepted was 4,493,164 bytes (4,494,140 got 413).
    /// The file limit leaves 13 KB for multipart framing and the optional bank_name/account_label fields, 8 KB more than they need.
    public static let maxStatementBytes = 4_480_000
    /// The limit in whole megabytes, rounded down. Uses MiB (the larger unit) so the figure never overstates the limit.
    public static let maxStatementMB = max(1, maxStatementBytes / 1_048_576)

    private let baseURL: URL
    private let session: URLSession
    private let accessToken: @Sendable () async throws -> String?

    /// `accessToken` returns nil when there is no session (the call is then unauthorized, with no request). It
    /// throws when it can't tell, for example offline while refreshing an expired token: that error is the call's.
    public init(baseURL: URL, session: URLSession = .shared,
                accessToken: @escaping @Sendable () async throws -> String?) {
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

    public func setCategory(transactionID: String, category: String?) async throws {
        try await sendIgnoringBody(.setCategory(id: transactionID, category: category))
    }

    public func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws {
        try await sendIgnoringBody(.budgetGoal(name: name, categoryID: categoryID, amount: amount))
    }

    public func transactions(statementID: String) async throws -> [Transaction] {
        try await send(.transactions(statementID: statementID))
    }

    public func uploadStatement(fileURL: URL, mimeType: String, bankName: String?) async throws -> Statement {
        let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if size > Self.maxStatementBytes { throw APIError.fileTooLarge(maxMB: Self.maxStatementMB) }
        let fileData = try Data(contentsOf: fileURL)
        if fileData.count > Self.maxStatementBytes { throw APIError.fileTooLarge(maxMB: Self.maxStatementMB) }

        let boundary = "spendoza-\(UUID().uuidString)"
        let bank = (bankName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let body = Multipart.body(boundary: boundary, fileField: "file", filename: fileURL.lastPathComponent,
                                  mimeType: mimeType, data: fileData, fields: bank.isEmpty ? [] : [("bank_name", bank)])

        var endpoint = Endpoint(method: .post, path: Endpoint.uploadPath)
        endpoint.body = body
        let data = try await perform(endpoint, contentType: "multipart/form-data; boundary=\(boundary)")
        return try decode(Statement.self, from: data)
    }

    public func statements() async throws -> [Statement] { try await send(.statements) }

    public func reprocessStatement(id: String) async throws { try await sendIgnoringBody(.reprocess(id: id)) }

    public func removeStatement(id: String) async throws { try await sendIgnoringBody(.remove(id: id)) }

    // MARK: AccountAPI

    public func uploadAvatar(jpegData: Data) async throws -> Profile {
        let boundary = "spendoza-\(UUID().uuidString)"
        var endpoint = Endpoint(method: .post, path: Endpoint.avatarPath)
        endpoint.body = Multipart.body(boundary: boundary, fileField: "file", filename: "avatar.jpg",
                                       mimeType: "image/jpeg", data: jpegData)
        let data = try await perform(endpoint, contentType: "multipart/form-data; boundary=\(boundary)")
        return try decode(Profile.self, from: data)
    }

    public func signOutOtherSessions() async throws { try await sendIgnoringBody(.signOutOthers) }

    public func deleteAccount() async throws { try await sendIgnoringBody(.deleteAccount) }

    public func inviteCodes() async throws -> [InviteCode] { try await send(.inviteCodes) }

    public func createInviteCode() async throws -> InviteCode { try await send(.createInviteCode) }

    public func personalReportPDF(_ period: ReportPeriod) async throws -> PDFFile {
        let (data, response) = try await performResponse(.personalReportPDF(period))
        let header = response.value(forHTTPHeaderField: "Content-Disposition")
        return PDFFile(data: data, filename: PDFFile.filename(fromContentDisposition: header))
    }

    public func sendTestEmail() async throws { try await sendIgnoringBody(.sendTestEmail) }

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
        try await performResponse(endpoint, contentType: contentType, notFoundIsNil: notFoundIsNil)?.0
    }

    /// The body with its response (for the headers).
    private func performResponse(_ endpoint: Endpoint, contentType: String? = nil) async throws -> (Data, HTTPURLResponse) {
        // With notFoundIsNil false this never returns nil.
        guard let result = try await performResponse(endpoint, contentType: contentType, notFoundIsNil: false) else {
            throw APIError.message("Something went wrong. Try again.")
        }
        return result
    }

    /// nil on a 404 when `notFoundIsNil`.
    private func performResponse(_ endpoint: Endpoint, contentType: String? = nil,
                                 notFoundIsNil: Bool) async throws -> (Data, HTTPURLResponse)? {
        var token: String?
        if endpoint.requiresAuth {
            do {
                token = try await accessToken()
            } catch let error as URLError where error.code != .cancelled {
                throw APIError.offline
            }
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

        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        if (200..<300).contains(status), let http { return (data, http) }
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
