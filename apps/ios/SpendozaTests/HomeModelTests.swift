import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct HomeModelTests {
    private let invitation = MyInvitation(id: "inv1", householdName: "The Smiths", inviterName: "Sam",
                                          expiresAt: Date(timeIntervalSince1970: 1_795_000_000))
    private let household = Household(id: "h1", name: "The Smiths", headID: "u1",
                                      members: [Member(id: "u1", displayName: "Sam"), Member(id: "me", displayName: "Me")])

    @Test func noHouseholdWithAnInvitationShowsIt() async {
        let api = StubAPI()
        api.myInvitationsResult = .success([invitation])
        let m = HomeModel(api: api, selfID: { "me" })
        await m.load()
        #expect(m.state == .none(invitations: [invitation]))
    }

    @Test func aHouseholdIsAMemberStateWithHeadFlag() async {
        let api = StubAPI()
        api.householdResult = .success(household)
        let member = HomeModel(api: api, selfID: { "me" })
        await member.load()
        #expect(member.state == .member(household, isHead: false))
        let head = HomeModel(api: api, selfID: { "u1" })
        await head.load()
        #expect(head.state == .member(household, isHead: true))
        #expect(!api.calls.contains("myInvitations"))
    }

    @Test func isHeadFollowsTheCurrentSessionAtEachLoad() async {
        final class Box { var id = "me" }
        let box = Box()
        let api = StubAPI()
        api.householdResult = .success(household)
        let m = HomeModel(api: api, selfID: { box.id })
        await m.load()
        #expect(m.state == .member(household, isHead: false))
        box.id = "u1"
        await m.load()
        #expect(m.state == .member(household, isHead: true))
    }

    @Test func acceptingSendsTheNormalizedCodeAndReloadsIntoTheHousehold() async {
        let api = StubAPI()
        api.myInvitationsResult = .success([invitation])
        let m = HomeModel(api: api, selfID: { "me" })
        await m.load()
        api.householdResult = .success(household)
        await m.accept(invitation, code: " ABCDE-FGHJK ")
        #expect(api.calls.contains("acceptInvitation(inv1, abcdefghjk)"))
        #expect(m.state == .member(household, isHead: false))
    }

    @Test func decliningReloadsWithoutIt() async {
        let api = StubAPI()
        api.myInvitationsResult = .success([invitation])
        let m = HomeModel(api: api, selfID: { "me" })
        await m.load()
        api.myInvitationsResult = .success([])
        await m.decline(invitation, code: "abcdefghjk")
        #expect(api.calls.contains("declineInvitation(inv1, abcdefghjk)"))
        #expect(m.state == .none(invitations: []))
    }

    @Test func aFailedAcceptShowsTheServersTextAndKeepsTheInvitation() async {
        let api = StubAPI()
        api.myInvitationsResult = .success([invitation])
        api.householdActionErrors["acceptInvitation"] = .message("Invitation not found")
        let m = HomeModel(api: api, selfID: { "me" })
        await m.load()
        await m.accept(invitation, code: "wrong")
        #expect(m.invitationErrors["inv1"] == "Invitation not found")
        #expect(m.state == .none(invitations: [invitation]))
        #expect(m.busyInvitationID == nil)
    }

    @Test func aPlanRefusalOnLoadIsNotOnPlan() async {
        let api = StubAPI()
        api.householdResult = .failure(.notOnPlan(requiredTier: "pro"))
        let m = HomeModel(api: api, selfID: { "me" })
        await m.load()
        #expect(m.state == .notOnPlan)
    }

    @Test func aLoadFailureShowsTheMessage() async {
        let api = StubAPI()
        api.householdResult = .failure(.message("Boom"))
        let m = HomeModel(api: api, selfID: { "me" })
        await m.load()
        #expect(m.state == .failed("Boom"))
    }

    @Test func joinSendsTheNormalizedCodeThenReloads() async throws {
        let api = StubAPI()
        let m = HomeModel(api: api, selfID: { "me" })
        await m.load()
        api.householdResult = .success(household)
        try await m.join(code: " abcde-FGHJK ")
        #expect(api.calls.contains("joinHousehold(abcdefghjk)"))
        #expect(m.state == .member(household, isHead: false))
    }

    @Test func joinErrorTextIsTheServersVerbatim() async {
        let api = StubAPI()
        api.householdActionErrors["joinHousehold"] = .message("Invalid invite code")
        let m = HomeModel(api: api, selfID: { "me" })
        await #expect(throws: APIError.message("Invalid invite code")) { try await m.join(code: "nope") }
    }

    @Test func createTrimsTheNameThenReloads() async throws {
        let api = StubAPI()
        let m = HomeModel(api: api, selfID: { "u1" })
        api.householdResult = .success(household)
        try await m.create(name: "  The Smiths ")
        #expect(api.calls.contains("createHousehold(The Smiths)"))
        #expect(m.state == .member(household, isHead: true))
    }

    @Test func createPlanRefusalThrows() async {
        let api = StubAPI()
        api.householdActionErrors["createHousehold"] = .notOnPlan(requiredTier: "pro")
        let m = HomeModel(api: api, selfID: { "me" })
        await #expect(throws: APIError.notOnPlan(requiredTier: "pro")) { try await m.create(name: "x") }
    }

    @Test func signUpNoticeWords() {
        #expect(HomeModel.signUpNotice(SignUpResult(joinedHousehold: true), householdName: "The Smiths") == "You've joined The Smiths")
        #expect(HomeModel.signUpNotice(SignUpResult(joinedHousehold: true), householdName: nil) == "You've joined the household")
        #expect(HomeModel.signUpNotice(SignUpResult(householdFull: true), householdName: nil) == "That household is full now")
        #expect(HomeModel.signUpNotice(SignUpResult(householdNotOnPlan: true), householdName: nil) == "That household isn't available on your plan yet")
        #expect(HomeModel.signUpNotice(SignUpResult(), householdName: nil) == nil)
    }
}
