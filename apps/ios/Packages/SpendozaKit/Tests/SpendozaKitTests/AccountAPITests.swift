import Foundation
import Testing
@testable import SpendozaKit

/// Shares `APIClientTests`' suite: both install the process-wide `StubURLProtocol` handler, so they must not run in parallel.
extension APIClientTests {
    @discardableResult
    func stub(status: Int = 200, body: String = "{}", headers: [String: String]) -> RequestLog {
        let log = RequestLog()
        StubURLProtocol.setHandler { request in
            log.add(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"].merging(headers) { $1 })!
            return (response, Data(body.utf8))
        }
        return log
    }

    static let fullProfile = """
    {"id":"p1","display_name":"Sam","onboarding_completed":true,"is_admin":false,"email_reports_enabled":true,
     "household_id":null,"timezone":"UTC","avatar_url":"https://cdn.example.test/a.jpg","email_report_day":"monday",
     "email_report_hour":7,"subscription_tier":"pro","created_at":"2026-03-04T10:00:00.000Z"}
    """

    // MARK: profile

    @Test func profileDecodesTheAccountFields() throws {
        let profile = try APICoding.makeDecoder().decode(Profile.self, from: Data(Self.fullProfile.utf8))
        #expect(profile.avatarURL == URL(string: "https://cdn.example.test/a.jpg"))
        #expect(profile.emailReportDay == .monday)
        #expect(profile.emailReportHour == 7)
        #expect(profile.subscriptionTier == "pro")
        #expect(profile.createdAt != nil)
    }

    @Test func profileWithoutThemGetsDefaults() throws {
        let json = #"{"id":"p1","display_name":"Sam","onboarding_completed":true,"is_admin":false,"email_reports_enabled":true,"household_id":null}"#
        let profile = try APICoding.makeDecoder().decode(Profile.self, from: Data(json.utf8))
        #expect(profile.avatarURL == nil)
        #expect(profile.emailReportDay == .saturday)
        #expect(profile.emailReportHour == 9)
        #expect(profile.subscriptionTier == "free")
        #expect(profile.createdAt == nil)
    }

    @Test func weekdayTitleIsCapitalized() {
        #expect(Weekday.monday.title == "Monday")
        #expect(Weekday.allCases.count == 7)
    }

    @Test func updateProfileSendsOnlyTheChangedKeys() async throws {
        let log = stub(body: Self.fullProfile)
        _ = try await client().updateProfile(ProfileChange(emailReportDay: .monday, emailReportHour: 7))
        let sent = log.all.first
        #expect(sent?.method == "PUT")
        #expect(Set(sent?.json?.keys.map { $0 } ?? []) == ["email_report_day", "email_report_hour"])
        #expect(sent?.json?["email_report_day"] as? String == "monday")
        #expect(sent?.json?["email_report_hour"] as? Int == 7)
    }

    @Test func updateProfileSendsDisplayName() async throws {
        let log = stub(body: Self.fullProfile)
        _ = try await client().updateProfile(ProfileChange(displayName: "Sam"))
        #expect(log.all.first?.json?["display_name"] as? String == "Sam")
    }

    // MARK: avatar

    @Test func uploadAvatarSendsAJPEGFilePart() async throws {
        let log = stub(body: Self.fullProfile)
        let profile = try await client().uploadAvatar(jpegData: Data([0xFF, 0xD8, 0xFF]))
        let sent = try #require(log.all.first)
        #expect(sent.method == "POST")
        #expect(sent.path == "/api/profile/avatar")
        #expect(sent.headers["Content-Type"]?.hasPrefix("multipart/form-data; boundary=") == true)
        let text = String(decoding: sent.body, as: UTF8.self)
        #expect(text.contains(#"name="file"; filename="avatar.jpg""#))
        #expect(text.contains("Content-Type: image/jpeg"))
        #expect(profile.avatarURL != nil)
    }

    @Test func statementUploadStillSendsFileAndBankName() async throws {
        let log = stub(body: #"{"id":"s1","status":"uploaded","file_type":"pdf","created_at":"2026-10-01T00:00:00.000Z"}"#)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("a\"b.pdf")
        try Data("pdf".utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        _ = try await client().uploadStatement(fileURL: url, mimeType: "application/pdf", bankName: " Chase ")
        let text = String(decoding: log.all.first?.body ?? Data(), as: UTF8.self)
        #expect(text.contains(#"name="file"; filename="a'b.pdf""#))
        #expect(text.contains("Content-Type: application/pdf"))
        #expect(text.contains("name=\"bank_name\"\r\n\r\nChase\r\n"))
    }

    // MARK: sessions & deletion

    @Test func signOutOtherSessionsPostsToTheServer() async throws {
        let log = stub(body: #"{"signed_out_others":true}"#)
        try await client().signOutOtherSessions()
        #expect(log.all.first?.method == "POST")
        #expect(log.all.first?.path == "/api/profile/sign-out-others")
    }

    @Test func deleteAccountSendsTheConfirmation() async throws {
        let log = stub(body: #"{"deleted":true}"#)
        try await client().deleteAccount()
        let sent = log.all.first
        #expect(sent?.method == "DELETE")
        #expect(sent?.path == "/api/profile")
        #expect(sent?.json as? [String: String] == ["confirm": "DELETE"])
    }

    @Test func deleteAccountAsHouseholdHeadShowsTheServerMessage() async {
        let text = "You're the head of a household that has other members. Transfer household ownership to another member before deleting your account."
        stub(status: 409, body: #"{"error":"\#(text)"}"#)
        await expectError(.message(text)) { try await client().deleteAccount() }
    }

    // MARK: invite codes

    @Test func inviteCodesDecode() async throws {
        stub(body: """
        [{"id":"i1","code":"ABC","created_by":"p1","used_by":null,"used_at":null,"created_at":"2026-10-01T00:00:00.000Z"},
         {"id":"i2","code":"DEF","created_by":"p1","used_by":"p2","used_at":"2026-10-02T00:00:00.000Z","created_at":"2026-09-01T00:00:00.000Z"}]
        """)
        let codes = try await client().inviteCodes()
        #expect(codes.map(\.code) == ["ABC", "DEF"])
        #expect(codes.map(\.isUsed) == [false, true])
    }

    @Test func inviteCodeWithOnlyUsedByIsUsed() throws {
        let json = #"{"id":"i","code":"X","used_by":"p2","used_at":null,"created_at":"2026-10-01T00:00:00.000Z"}"#
        let code = try APICoding.makeDecoder().decode(InviteCode.self, from: Data(json.utf8))
        #expect(code.isUsed)
    }

    @Test func createInviteCodePostsAnEmptyObject() async throws {
        let log = stub(status: 201, body: #"{"id":"i3","code":"NEW","used_by":null,"used_at":null,"created_at":"2026-10-30T00:00:00.000Z"}"#)
        let code = try await client().createInviteCode()
        #expect(code.code == "NEW")
        #expect(log.all.first?.method == "POST")
        #expect(log.all.first?.path == "/api/invite-codes")
        #expect(String(decoding: log.all.first?.body ?? Data(), as: UTF8.self) == "{}")
    }

    @Test func fourthInviteCodeIsRefused() async {
        stub(status: 400, body: #"{"error":"Maximum of 3 invite codes allowed"}"#)
        await expectError(.message("Maximum of 3 invite codes allowed")) { try await client().createInviteCode() }
    }

    // MARK: PDF

    @Test func monthPDFUsesTheMonthQueryAndHeaderFilename() async throws {
        let log = stub(body: "%PDF", headers: [
            "Content-Type": "application/pdf",
            "Content-Disposition": #"attachment; filename="spendoza-report-2026-09.pdf""#,
        ])
        let file = try await client().personalReportPDF(.month(Month(year: 2026, month: 9)))
        #expect(log.all.first?.path == "/api/reports/export/personal")
        #expect(log.all.first?.query == ["month": "2026-09-01"])
        #expect(file.data == Data("%PDF".utf8))
        #expect(file.filename == "spendoza-report-2026-09.pdf")
    }

    @Test func rangePDFUsesFromAndToDates() async throws {
        let log = stub(body: "%PDF")
        let file = try await client().personalReportPDF(.range(from: Month(year: 2026, month: 8), to: Month(year: 2026, month: 10)))
        #expect(log.all.first?.query == ["from_date": "2026-08-01", "to_date": "2026-10-31"])
        #expect(file.filename == "spendoza-report.pdf")
    }

    @Test func rangeEndsOnTheLastDayOfShortMonths() {
        #expect(Month(year: 2028, month: 2).lastDayString == "2028-02-29")
        #expect(Month(year: 2027, month: 2).lastDayString == "2027-02-28")
        #expect(Month(year: 2026, month: 4).lastDayString == "2026-04-30")
    }

    @Test func pdfFilenameWithASlashIsIgnored() async throws {
        stub(body: "%PDF", headers: ["Content-Disposition": #"attachment; filename="../evil.pdf""#])
        let file = try await client().personalReportPDF(.month(Month(year: 2026, month: 9)))
        #expect(file.filename == "spendoza-report.pdf")
    }

    @Test func pdfNotFoundShowsTheServerMessage() async {
        stub(status: 404, body: #"{"error":"No report data available for this period"}"#)
        await expectError(.message("No report data available for this period")) {
            try await client().personalReportPDF(.month(Month(year: 2026, month: 9)))
        }
    }

    // MARK: test email

    @Test func sendTestEmailPosts() async throws {
        let log = stub(body: #"{"message":"Test email triggered","job_id":"j"}"#)
        try await client().sendTestEmail()
        #expect(log.all.first?.method == "POST")
        #expect(log.all.first?.path == "/api/emails/send-test")
    }
}
