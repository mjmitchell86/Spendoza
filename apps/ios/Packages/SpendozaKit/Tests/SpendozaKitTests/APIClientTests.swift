import Foundation
import Testing
@testable import SpendozaKit

@Suite(.serialized)
struct APIClientTests {
    let base = URL(string: "https://api.example.test")!

    func client(token: String? = "tok") -> APIClient {
        APIClient(baseURL: base, session: StubURLProtocol.session(), accessToken: { token })
    }

    /// Installs a handler that logs requests and answers with `status` and `body`.
    @discardableResult
    func stub(status: Int = 200, body: String = "{}") -> RequestLog {
        let log = RequestLog()
        StubURLProtocol.setHandler { request in
            log.add(request)
            return (httpResponse(request, status: status), Data(body.utf8))
        }
        return log
    }

    func expectError(_ expected: APIError, _ work: () async throws -> some Any) async {
        do {
            _ = try await work()
            Issue.record("Expected \(expected) but the call succeeded")
        } catch let error as APIError {
            #expect(error == expected)
        } catch {
            Issue.record("Expected \(expected) but got \(error)")
        }
    }

    // MARK: auth & errors

    @Test func everyRequestCarriesTheBearerToken() async throws {
        let log = stub(body: #"{"id":"p1","display_name":"Sam","onboarding_completed":true,"is_admin":false,"email_reports_enabled":true,"household_id":null,"timezone":"UTC"}"#)
        _ = try await client().profile()
        #expect(log.all.first?.headers["Authorization"] == "Bearer tok")
        #expect(log.all.first?.path == "/api/profile")
        #expect(log.all.first?.method == "GET")
    }

    @Test func missingTokenIsUnauthorizedWithoutARequest() async {
        let log = stub()
        await expectError(.unauthorized) { try await client(token: nil).categories() }
        #expect(log.count == 0)
    }

    @Test func status401IsUnauthorized() async {
        stub(status: 401, body: #"{"error":"Invalid or expired token"}"#)
        await expectError(.unauthorized) { try await client().categories() }
    }

    @Test func status403WithRequiredTierIsNotOnPlan() async {
        stub(status: 403, body: #"{"error":"Upgrade required","required_tier":"starter","current_tier":"free"}"#)
        await expectError(.notOnPlan(requiredTier: "starter")) {
            try await client().createBudgetGoal(name: "x", categoryID: "c1", amount: 1)
        }
    }

    @Test func status403WithoutTierIsAMessage() async {
        stub(status: 403, body: #"{"error":"Forbidden"}"#)
        await expectError(.message("Forbidden")) { try await client().categories() }
    }

    @Test func serverErrorTextBecomesAMessage() async {
        stub(status: 400, body: #"{"error":"Invalid invite code"}"#)
        await expectError(.message("Invalid invite code")) {
            try await client(token: nil).signUp(email: "a@b.co", password: "password1", displayName: "A", inviteCode: "nope")
        }
    }

    @Test func errorWithoutJSONBodyGetsAGenericMessage() async {
        stub(status: 502, body: "<html>Bad gateway</html>")
        await expectError(.message("Something went wrong. Try again.")) { try await client().categories() }
    }

    @Test func status413IsFileTooLarge() async {
        stub(status: 413, body: "Request Entity Too Large")
        await expectError(.fileTooLarge(maxMB: APIClient.maxStatementMB)) { try await client().categories() }
    }

    @Test(arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut])
    func connectivityFailuresAreOffline(code: URLError.Code) async {
        StubURLProtocol.setHandler { _ in throw URLError(code) }
        await expectError(.offline) { try await client().categories() }
    }

    // MARK: endpoints

    @Test func personalReportBuildsTheMonthQuery() async throws {
        let log = stub(body: String(decoding: try Fixture.data("report-2026-10"), as: UTF8.self))
        let report = try await client().personalReport(Month(year: 2026, month: 10))
        #expect(log.all.first?.path == "/api/reports/personal")
        #expect(log.all.first?.query == ["month": "2026-10-01"])
        #expect(report?.month == Month(year: 2026, month: 10))
        #expect(report?.data.health != nil)
    }

    @Test func personalReport404IsNil() async throws {
        stub(status: 404, body: #"{"error":"Report not found for this month"}"#)
        let report = try await client().personalReport(Month(year: 2026, month: 10))
        #expect(report == nil)
    }

    @Test func completeOnboardingPutsToOnboarding() async throws {
        let log = stub()
        try await client().completeOnboarding()
        #expect(log.all.first?.method == "PUT")
        #expect(log.all.first?.path == "/api/profile/onboarding")
    }

    @Test func updateProfileSendsOnlyTheChangedFields() async throws {
        let log = stub(body: #"{"id":"p1","display_name":"Sam","onboarding_completed":true,"is_admin":false,"email_reports_enabled":false,"household_id":"h1","timezone":"UTC"}"#)
        let profile = try await client().updateProfile(ProfileChange(emailReportsEnabled: false))
        #expect(log.all.first?.method == "PUT")
        #expect(log.all.first?.path == "/api/profile")
        #expect(log.all.first?.json?["email_reports_enabled"] as? Bool == false)
        #expect(log.all.first?.json?.keys.contains("timezone") == false)
        #expect(log.all.first?.headers["Content-Type"] == "application/json")
        #expect(profile.householdID == "h1")
        #expect(profile.emailReportsEnabled == false)
    }

    @Test func categoriesDecode() async throws {
        let log = stub(body: #"[{"id":"c1","name":"Housing","budget_class":"need","extra":1}]"#)
        let categories = try await client().categories()
        #expect(log.all.first?.path == "/api/categories")
        #expect(categories == [BudgetCategory(id: "c1", name: "Housing", budgetClass: .need)])
    }

    @Test func transactionsSendDateRangeAndDecode() async throws {
        let log = stub(body: #"[{"id":"t1","date":"2026-10-03","description":"Coffee","amount":4.5,"type":"debit","ai_category":"Dining out","user_id":"u"}]"#)
        let cal = Calendar.current
        let from = try #require(cal.date(from: DateComponents(year: 2026, month: 10, day: 1)))
        let to = try #require(cal.date(from: DateComponents(year: 2026, month: 10, day: 31)))
        let rows = try await client().transactions(from: from, to: to)
        #expect(log.all.first?.query == ["from_date": "2026-10-01", "to_date": "2026-10-31"])
        #expect(rows.first?.category == "Dining out")
        #expect(rows.first?.amount == 4.5)
    }

    @Test func setCategorySendsAICategory() async throws {
        let log = stub()
        try await client().setCategory(transactionID: "t1", category: "Groceries")
        #expect(log.all.first?.method == "PUT")
        #expect(log.all.first?.path == "/api/transactions/t1")
        #expect(log.all.first?.json as? [String: String] == ["ai_category": "Groceries"])
    }

    @Test func createBudgetGoalSendsExactBody() async throws {
        let log = stub(status: 201)
        try await client().createBudgetGoal(name: "Dining out", categoryID: "c3", amount: 200)
        let request = try #require(log.all.first)
        #expect(request.method == "POST")
        #expect(request.path == "/api/goals")
        let json = try #require(request.json)
        #expect(json["goal_type"] as? String == "budget")
        #expect(json["category_id"] as? String == "c3")
        #expect(json["target_amount"] as? Int == 200)
        #expect(json["name"] as? String == "Dining out")
        #expect(json.count == 4)
    }

    @Test func signUpAndWaitlistWorkWithoutAToken() async throws {
        let log = stub(status: 201)
        try await client(token: nil).signUp(email: "a@b.co", password: "password1", displayName: "Ann", inviteCode: "ABC")
        try await client(token: nil).joinWaitlist(name: "Ann", email: "a@b.co")
        #expect(log.all[0].path == "/api/auth/signup")
        #expect(log.all[0].json as? [String: String] == ["email": "a@b.co", "password": "password1", "display_name": "Ann", "invite_code": "ABC"])
        #expect(log.all[0].headers["Authorization"] == nil)
        #expect(log.all[1].path == "/api/auth/waitlist")
        #expect(log.all[1].json as? [String: String] == ["name": "Ann", "email": "a@b.co"])
    }

    @Test func inviteCodeIsTrimmedButKeepsItsCase() async throws {
        let log = stub(status: 201)
        try await client(token: nil).signUp(email: "a@b.co", password: "password1", displayName: "Ann", inviteCode: " ab12cd34 \n")
        try await client(token: nil).signUp(email: "a@b.co", password: "password1", displayName: "Ann", inviteCode: "AbC")
        #expect((log.all[0].json as? [String: String])?["invite_code"] == "ab12cd34")
        #expect((log.all[1].json as? [String: String])?["invite_code"] == "AbC")
    }

    // MARK: statements

    @Test func statementsDecodeWithBothDateShapes() async throws {
        let body = """
        [{"id":"s1","user_id":"u","file_path":"u/a.pdf","file_hash":"h","file_type":"pdf","bank_name":"Chase","statement_month":null,
          "is_shared_account":false,"account_label":"Joint","status":"processing","parsed_data":{"pipeline_step":"categorizing"},
          "created_at":"2026-10-29T12:34:56.123456+00:00"},
         {"id":"s2","file_type":"csv","bank_name":null,"account_label":null,"status":"failed","parsed_data":null,
          "created_at":"2026-10-28T09:00:00Z"}]
        """
        let log = stub(body: body)
        let rows = try await client().statements()
        #expect(log.all.first?.path == "/api/bank-statements")
        #expect(rows.count == 2)
        #expect(rows[0].status == .processing)
        #expect(rows[0].fileType == "pdf")
        #expect(rows[0].bankName == "Chase")
        #expect(rows[0].accountLabel == "Joint")
        #expect(rows[0].pipelineStep == "categorizing")
        let expected = ISO8601DateFormatter().date(from: "2026-10-29T12:34:56Z")!.timeIntervalSince1970 + 0.123
        #expect(abs(rows[0].createdAt.timeIntervalSince1970 - expected) < 0.01)
        #expect(rows[1].status == .failed)
        #expect(rows[1].pipelineStep == nil)
        #expect(rows[1].createdAt == ISO8601DateFormatter().date(from: "2026-10-28T09:00:00Z"))
    }

    @Test func reprocessAndRemoveStatement() async throws {
        let log = stub()
        try await client().reprocessStatement(id: "s1")
        try await client().removeStatement(id: "s1")
        #expect(log.all[0].method == "POST")
        #expect(log.all[0].path == "/api/bank-statements/s1/reprocess")
        #expect(log.all[1].method == "DELETE")
        #expect(log.all[1].path == "/api/bank-statements/s1")
    }

    @Test func removeStatementAccepts204() async throws {
        stub(status: 204, body: "")
        try await client().removeStatement(id: "s1")
    }

    func tempFile(bytes: Int, name: String = "stmt.pdf") throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        try Data(repeating: 0x41, count: bytes).write(to: url)
        return url
    }

    @Test func uploadSendsMultipartFileField() async throws {
        let log = stub(status: 201, body: #"{"id":"s9","file_type":"pdf","status":"uploaded","created_at":"2026-10-29T12:00:00Z"}"#)
        let url = try tempFile(bytes: 64)
        let statement = try await client().uploadStatement(fileURL: url, mimeType: "application/pdf")
        let request = try #require(log.all.first)
        #expect(request.method == "POST")
        #expect(request.path == "/api/bank-statements/upload")
        let contentType = try #require(request.headers["Content-Type"])
        #expect(contentType.hasPrefix("multipart/form-data; boundary="))
        let text = String(decoding: request.body, as: UTF8.self)
        #expect(text.contains(#"name="file"; filename="stmt.pdf""#))
        #expect(text.contains("Content-Type: application/pdf"))
        #expect(request.body.count > 64)
        #expect(statement.id == "s9")
        #expect(statement.status == .uploaded)
    }

    @Test func oversizedUploadThrowsWithoutARequest() async throws {
        let log = stub()
        let url = try tempFile(bytes: APIClient.maxStatementBytes + 1)
        await expectError(.fileTooLarge(maxMB: 4)) {
            try await client().uploadStatement(fileURL: url, mimeType: "application/pdf")
        }
        #expect(log.count == 0)
    }

    @Test func fileTooLargeNeverOverstatesTheLimit() {
        #expect(APIClient.maxStatementMB * 1_048_576 <= APIClient.maxStatementBytes)
        #expect(APIError.fileTooLarge(maxMB: 4).userMessage == "This file is too large (max 4 MB)")
    }
}
