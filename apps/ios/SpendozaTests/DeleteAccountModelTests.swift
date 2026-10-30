import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct DeleteAccountModelTests {
    private func model(_ api: StubAPI, onDeleted: @escaping @MainActor () async -> Void = {}) -> DeleteAccountModel {
        DeleteAccountModel(api: api, onDeleted: onDeleted)
    }

    @Test func onlyTheExactWordEnablesDeleting() {
        let m = model(StubAPI())
        #expect(!m.canDelete)
        for typed in ["delete", "DELETE ", " DELETE", "Delete", "DELET"] {
            m.typed = typed
            #expect(!m.canDelete, "\(typed)")
        }
        m.typed = "DELETE"
        #expect(m.canDelete)
    }

    @Test func successDeletesThenTellsTheAppOnce() async {
        let api = StubAPI()
        var deleted = 0
        var callsWhenDeleted: [String] = []
        let m = model(api) { deleted += 1; callsWhenDeleted = api.calls }
        m.typed = "DELETE"
        await m.delete()
        #expect(callsWhenDeleted == ["deleteAccount"])
        #expect(deleted == 1)
        #expect(m.error == nil)
    }

    @Test func aHouseholdHeadSeesTheServersMessageAndStaysSignedIn() async {
        let text = "You're the head of a household that has other members. Transfer household ownership to another member before deleting your account."
        let api = StubAPI()
        api.deleteAccountError = .message(text)
        var deleted = 0
        let m = model(api) { deleted += 1 }
        m.typed = "DELETE"
        await m.delete()
        #expect(m.error == text)
        #expect(deleted == 0)
        #expect(!m.deleting)
    }

    @Test func aFailureShowsTheServerText() async {
        let text = "We couldn't delete your account. Please try again, or contact support if this keeps happening."
        let api = StubAPI()
        api.deleteAccountError = .message(text)
        let m = model(api)
        m.typed = "DELETE"
        await m.delete()
        #expect(m.error == text)
    }

    @Test func aFailureWithNoTextSaysFailedToDeleteAccount() async {
        let api = StubAPI()
        api.deleteAccountError = .message("")
        let m = model(api)
        m.typed = "DELETE"
        await m.delete()
        #expect(m.error == "Failed to delete account")
    }

    @Test func nothingHappensUntilTheWordIsTyped() async {
        let api = StubAPI()
        var deleted = 0
        let m = model(api) { deleted += 1 }
        m.typed = "delete"
        await m.delete()
        #expect(api.calls.isEmpty)
        #expect(deleted == 0)
    }
}
