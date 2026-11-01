import Foundation
import Testing
@testable import SpendozaKit

/// Shares `APIClientTests`' suite: the `StubURLProtocol` handler is process-wide.
extension APIClientTests {
    private static let householdBody = """
    {"household":{"id":"h1","name":"The Smiths","head_of_household_id":"u1","created_at":"2026-03-04T10:00:00.000Z","invite_code":"abcdefghjk"},
     "members":[{"id":"u2","display_name":"Bo","income_sharing_mode":"partial","expense_sharing_mode":"category"},
                {"id":"u1","display_name":"Ann","income_sharing_mode":"all","expense_sharing_mode":"none"}]}
    """

    // MARK: decoding

    @Test func householdDecodesForTheHead() async throws {
        let log = stub(body: Self.householdBody)
        let household = try #require(try await client().household())
        #expect(log.all.first?.method == "GET")
        #expect(log.all.first?.path == "/api/household")
        #expect(household.id == "h1")
        #expect(household.name == "The Smiths")
        #expect(household.headID == "u1")
        #expect(household.inviteCode == "abcdefghjk")
        #expect(household.members.map(\.id) == ["u2", "u1"])
        #expect(household.members[0].incomeSharing == .partial)
        #expect(household.members[0].expenseSharing == .category)
        #expect(household.members[1].expenseSharing == ExpenseSharing.none)
    }

    @Test func householdWithoutAnInviteCodeKeyDecodesForAMember() async throws {
        stub(body: #"{"household":{"id":"h1","name":"The Smiths","head_of_household_id":"u1"},"members":[]}"#)
        let household = try #require(try await client().household())
        #expect(household.inviteCode == nil)
    }

    @Test func noHouseholdIs404ToNil() async throws {
        stub(status: 404, body: #"{"error":"Not a member of any household"}"#)
        #expect(try await client().household() == nil)
    }

    @Test func otherHouseholdFailuresStillThrow() async {
        stub(status: 500, body: #"{"error":"boom"}"#)
        await expectError(.message("boom")) { try await client().household() }
    }

    @Test func invitationsDecode() async throws {
        stub(body: """
        [{"id":"i1","email":"a@b.co","created_at":"2026-10-01T10:00:00.000Z","expires_at":"2026-10-08T10:00:00.000Z"}]
        """)
        let pending = try await client().pendingInvitations()
        #expect(pending.map(\.email) == ["a@b.co"])
        #expect(pending[0].expiresAt > pending[0].createdAt)

        stub(body: #"[{"id":"i2","household_name":"The Smiths","inviter_name":"Ann","expires_at":"2026-10-08T10:00:00.000Z"}]"#)
        let mine = try await client().myInvitations()
        #expect(mine.map(\.householdName) == ["The Smiths"])
        #expect(mine.map(\.inviterName) == ["Ann"])
    }

    // MARK: requests

    @Test func createSendsNameAndReturnsTheCode() async throws {
        let log = stub(status: 201, body: #"{"id":"h1","name":"Home","head_of_household_id":"u1","invite_code":"abcdefghjk"}"#)
        let code = try await client().createHousehold(name: "Home")
        let sent = try #require(log.all.first)
        #expect(sent.method == "POST")
        #expect(sent.path == "/api/household")
        #expect(sent.json as? [String: String] == ["name": "Home"])
        #expect(code == "abcdefghjk")
    }

    @Test func joinSendsTheTrimmedCode() async throws {
        let log = stub(body: #"{"message":"Joined household successfully"}"#)
        try await client().joinHousehold(code: " ABCDE-FGHJK \n")
        #expect(log.all.first?.method == "POST")
        #expect(log.all.first?.path == "/api/household/join")
        #expect(log.all.first?.json as? [String: String] == ["invite_code": "ABCDE-FGHJK"])
    }

    @Test func rotateReturnsTheRawCode() async throws {
        let log = stub(body: #"{"invite_code":"zyxwvutsrq"}"#)
        let code = try await client().rotateInviteCode()
        #expect(log.all.first?.method == "POST")
        #expect(log.all.first?.path == "/api/household/invite-code")
        #expect(code == "zyxwvutsrq")
    }

    @Test func renameSendsTheName() async throws {
        let log = stub(body: "{}")
        try await client().renameHousehold("New name")
        #expect(log.all.first?.method == "PATCH")
        #expect(log.all.first?.path == "/api/household")
        #expect(log.all.first?.json as? [String: String] == ["name": "New name"])
    }

    @Test func deleteSendsTheConfirmNameUntouched() async throws {
        let log = stub(status: 204, body: "")
        try await client().deleteHousehold(confirmName: " The Smiths")
        #expect(log.all.first?.method == "DELETE")
        #expect(log.all.first?.path == "/api/household")
        #expect(log.all.first?.json as? [String: String] == ["confirm_name": " The Smiths"])
    }

    @Test func inviteAndInvitationCallsUseTheirPaths() async throws {
        let log = stub(status: 204, body: "")
        let c = client()
        try await c.invite(email: "a@b.co")
        try await c.revokeInvitation(id: "i1")
        try await c.acceptInvitation(id: "i2", code: "abcdefghjk")
        try await c.declineInvitation(id: "i2", code: "abcdefghjk")
        let sent = log.all
        #expect(sent.map(\.method) == ["POST", "DELETE", "POST", "POST"])
        #expect(sent.map(\.path) == ["/api/household/invite", "/api/household/invitations/i1",
                                     "/api/household/invitations/i2/accept", "/api/household/invitations/i2/decline"])
        #expect(sent[0].json as? [String: String] == ["email": "a@b.co"])
        #expect(sent[1].body.isEmpty)
        #expect(sent[2].json as? [String: String] == ["code": "abcdefghjk"])
        #expect(sent[3].json as? [String: String] == ["code": "abcdefghjk"])
    }

    @Test func memberCallsUseTheirPaths() async throws {
        let log = stub(status: 204, body: "")
        let c = client()
        try await c.removeMember(id: "u2")
        try await c.makeHead(id: "u2")
        try await c.leaveHousehold()
        let sent = log.all
        #expect(sent.map(\.method) == ["DELETE", "POST", "POST"])
        #expect(sent.map(\.path) == ["/api/household/members/u2", "/api/household/transfer", "/api/household/leave"])
        #expect(sent[1].json as? [String: String] == ["new_head_id": "u2"])
        #expect(sent[0].body.isEmpty)
        #expect(sent[2].body.isEmpty)
    }

    // MARK: sharing

    @Test func sharingSendsAllThreeKeys() async throws {
        let log = stub(body: Self.fullProfile)
        let c = client()
        try await c.updateSharing(SharingChange(income: .partial, sharedIncomeAmount: 1500.5, expense: .category))
        try await c.updateSharing(SharingChange(income: .all, sharedIncomeAmount: 99, expense: .all))
        try await c.updateSharing(SharingChange(income: .none, expense: .none))
        let sent = log.all
        #expect(sent.allSatisfy { $0.method == "PUT" && $0.path == "/api/household/sharing" })
        let first = try #require(sent[0].json as? [String: Any])
        #expect(first["income_sharing_mode"] as? String == "partial")
        #expect(first["shared_income_amount"] as? Double == 1500.5)
        #expect(first["expense_sharing_mode"] as? String == "category")
        for index in [1, 2] {
            let json = try #require(sent[index].json as? [String: Any])
            #expect(json.count == 3)
            #expect(json["shared_income_amount"] is NSNull)
        }
        #expect((sent[2].json as? [String: Any])?["income_sharing_mode"] as? String == "none")
    }

    @Test func setCategorySharedSendsOnlyTheFlag() async throws {
        let log = stub(body: "{}")
        try await client().setCategoryShared(id: "c1", shared: true)
        let sent = try #require(log.all.first)
        #expect(sent.method == "PUT")
        #expect(sent.path == "/api/categories/c1")
        #expect(String(decoding: sent.body, as: UTF8.self) == #"{"is_shared_with_household":true}"#)
    }

    @Test func categoriesDecodeTheSharedFlagDefaultingToFalse() async throws {
        stub(body: """
        [{"id":"c1","name":"Rent","budget_class":"need","is_shared_with_household":true},
         {"id":"c2","name":"Fun","budget_class":"want"}]
        """)
        let categories = try await client().categories()
        #expect(categories.map(\.isSharedWithHousehold) == [true, false])
    }

    @Test func profileDecodesSharingSettings() throws {
        let json = #"{"id":"p1","display_name":"Sam","onboarding_completed":true,"is_admin":false,"email_reports_enabled":true,"household_id":"h1","income_sharing_mode":"partial","expense_sharing_mode":"category","shared_income_amount":"2500.00"}"#
        let profile = try APICoding.makeDecoder().decode(Profile.self, from: Data(json.utf8))
        #expect(profile.incomeSharing == .partial)
        #expect(profile.expenseSharing == .category)
        #expect(profile.sharedIncomeAmount == 2500)

        let bare = #"{"id":"p1","display_name":"Sam","onboarding_completed":true,"is_admin":false,"email_reports_enabled":true,"household_id":null,"shared_income_amount":null}"#
        let defaults = try APICoding.makeDecoder().decode(Profile.self, from: Data(bare.utf8))
        #expect(defaults.incomeSharing == IncomeSharing.none)
        #expect(defaults.expenseSharing == ExpenseSharing.none)
        #expect(defaults.sharedIncomeAmount == nil)
    }

    @Test func unknownSharingModesReadAsTheMostPrivate() throws {
        let member = #"{"id":"u2","display_name":"Bo","income_sharing_mode":"weekly","expense_sharing_mode":"tags"}"#
        let decoded = try APICoding.makeDecoder().decode(Member.self, from: Data(member.utf8))
        #expect(decoded.incomeSharing == IncomeSharing.none)
        #expect(decoded.expenseSharing == ExpenseSharing.none)

        let profile = #"{"id":"p1","display_name":"Sam","onboarding_completed":true,"is_admin":false,"email_reports_enabled":true,"household_id":"h1","income_sharing_mode":"weekly","expense_sharing_mode":"tags"}"#
        let p = try APICoding.makeDecoder().decode(Profile.self, from: Data(profile.utf8))
        #expect(p.incomeSharing == IncomeSharing.none)
        #expect(p.expenseSharing == ExpenseSharing.none)
    }

    @Test func absentSharingModesMeanNone() throws {
        // The database default is 'none' (initial_schema.sql), so a missing key is private, not shared.
        let member = #"{"id":"u2","display_name":"Bo"}"#
        let decoded = try APICoding.makeDecoder().decode(Member.self, from: Data(member.utf8))
        #expect(decoded.incomeSharing == IncomeSharing.none)
        #expect(decoded.expenseSharing == ExpenseSharing.none)
    }

    // MARK: errors

    @Test func inviteEmailFailureShowsTheServerText() async {
        stub(status: 502, body: #"{"error":"Couldn't send the invitation email. Try again."}"#)
        await expectError(.message("Couldn't send the invitation email. Try again.")) { try await client().invite(email: "a@b.co") }
    }

    @Test func rateLimitTextPassesThrough() async {
        stub(status: 429, body: #"{"error":"Too many attempts. Try again in 15 minutes."}"#)
        await expectError(.message("Too many attempts. Try again in 15 minutes.")) {
            try await client().acceptInvitation(id: "i", code: "c")
        }
    }

    @Test func householdCallsMapPlanRefusalToNotOnPlan() async {
        stub(status: 403, body: #"{"error":"Upgrade required","required_tier":"pro","current_tier":"free"}"#)
        await expectError(.notOnPlan(requiredTier: "pro")) { try await client().createHousehold(name: "Home") }
        await expectError(.notOnPlan(requiredTier: "pro")) { try await client().household() }
    }

    // MARK: sign-up result

    @Test func signUpDecodesTheHouseholdOutcome() async throws {
        stub(status: 201, body: #"{"user":{"id":"u"},"joined_household":true}"#)
        let joined = try await client(token: nil).signUp(email: "a@b.co", password: "password1", displayName: "A", inviteCode: "x")
        #expect(joined == SignUpResult(joinedHousehold: true))
        stub(status: 201, body: #"{"user":{"id":"u"},"joined_household":false,"household_full":true}"#)
        let full = try await client(token: nil).signUp(email: "a@b.co", password: "password1", displayName: "A", inviteCode: "x")
        #expect(full == SignUpResult(householdFull: true))
        stub(status: 201, body: #"{"user":{"id":"u"},"joined_household":false,"household_not_on_plan":true}"#)
        let notOnPlan = try await client(token: nil).signUp(email: "a@b.co", password: "password1", displayName: "A", inviteCode: "x")
        #expect(notOnPlan == SignUpResult(householdNotOnPlan: true))
    }
}
