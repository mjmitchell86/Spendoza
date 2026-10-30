import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct AIAssistantsModelTests {
    @Test func disconnectSignsOutOtherSessionsOnceAndFinishes() async {
        let api = StubAPI()
        let m = AIAssistantsModel(api: api)
        #expect(m.state == .idle)
        await m.disconnect()
        #expect(m.state == .done)
        #expect(AIAssistantsModel.doneMessage == "AI assistants and other sessions disconnected")
        #expect(api.calls == ["signOutOtherSessions"])
    }

    @Test func aServerErrorShowsItsWords() async {
        let api = StubAPI()
        api.signOutOthersError = .message("Could not sign out other sessions. Please try again.")
        let m = AIAssistantsModel(api: api)
        await m.disconnect()
        #expect(m.state == .failed("Could not sign out other sessions. Please try again."))
        #expect(api.calls == ["signOutOtherSessions"])
    }

    @Test func thisPhoneStaysSignedInSoOnlyTheOtherSessionsCallRuns() async {
        let api = StubAPI()
        let m = AIAssistantsModel(api: api)
        await m.disconnect()
        api.signOutOthersError = .offline
        await m.disconnect()
        #expect(api.calls == ["signOutOtherSessions", "signOutOtherSessions"])
    }
}
