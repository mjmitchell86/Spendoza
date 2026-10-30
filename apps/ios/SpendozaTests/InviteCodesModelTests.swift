import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct InviteCodesModelTests {
    private func code(_ n: Int, used: Bool = false) -> InviteCode {
        InviteCode(id: "i-\(n)", code: "CODE000\(n)", usedAt: used ? Date(timeIntervalSince1970: 1_790_100_000) : nil,
                   createdAt: Date(timeIntervalSince1970: 1_790_000_000 - Double(n)))
    }

    @Test func loadShowsTheCodesNewestFirstAsTheServerSentThem() async {
        let api = StubAPI()
        api.inviteCodeList = [code(1), code(2)]
        let m = InviteCodesModel(api: api)
        await m.load()
        #expect(m.codes.map(\.code) == ["CODE0001", "CODE0002"])
        #expect(m.footer == "2 of 3 codes created")
        #expect(m.canCreate)
        #expect(api.calls == ["inviteCodes"])
    }

    @Test func threeCodesIncludingAUsedOneStopCreating() async {
        let api = StubAPI()
        api.inviteCodeList = [code(1), code(2, used: true), code(3)]
        let m = InviteCodesModel(api: api)
        await m.load()
        #expect(!m.canCreate)
        #expect(m.footer == "3 of 3 codes created")
    }

    @Test func createPutsTheNewCodeFirst() async {
        let api = StubAPI()
        api.inviteCodeList = [code(1)]
        let m = InviteCodesModel(api: api)
        await m.load()
        await m.create()
        #expect(m.codes.count == 2)
        #expect(m.codes.first?.code == "CODE2")
        #expect(m.creating == false)
        #expect(m.error == nil)
        #expect(api.calls == ["inviteCodes", "createInviteCode"])
    }

    @Test func theServerRefusingAFourthCodeShowsItsWords() async {
        let api = StubAPI()
        api.createInviteCodeError = .message("Maximum of 3 invite codes allowed")
        let m = InviteCodesModel(api: api)
        await m.create()
        #expect(m.error == "Maximum of 3 invite codes allowed")
        #expect(m.codes.isEmpty)
    }

    @Test func aFailedLoadShowsTheError() async {
        let api = StubAPI()
        api.inviteCodesError = .offline
        let m = InviteCodesModel(api: api)
        await m.load()
        #expect(m.error == "You're offline. Check your connection and try again.")
    }

    @Test func shareTextNamesTheCodeAndTheSignUpPage() {
        #expect(InviteCodesModel.shareText("AB12CD34")
                == "Join me on Spendoza with invite code AB12CD34: https://www.spendoza.io/signup")
    }
}
