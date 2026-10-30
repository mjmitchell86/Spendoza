import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct MeModelTests {
    private let start = Profile(id: "u", displayName: "Matt", onboardingCompleted: true, isAdmin: false,
                                emailReportsEnabled: true, householdID: nil)

    private func model(_ api: StubAPI, applied: @escaping @MainActor (Profile) -> Void = { _ in }) -> MeModel {
        MeModel(api: api, profile: start, apply: applied)
    }

    @Test func saveNameTrimsAndSends() async {
        let api = StubAPI()
        var applied: Profile?
        let m = model(api) { applied = $0 }
        #expect(await m.saveName("  Matt  "))
        #expect(api.calls == ["updateProfile(email: nil, tz: nil, name: Matt)"])
        #expect(m.profile?.displayName == "Matt")
        #expect(applied?.displayName == "Matt")
        #expect(m.error == nil)
    }

    @Test func anEmptyNameMakesNoCall() async {
        let api = StubAPI()
        let m = model(api)
        #expect(await m.saveName("   ") == false)
        #expect(api.calls.isEmpty)
    }

    @Test func aTooLongNameIsRefused() async {
        let api = StubAPI()
        let m = model(api)
        #expect(await m.saveName(String(repeating: "a", count: 101)) == false)
        #expect(m.error == "Use 100 characters or fewer")
        #expect(api.calls.isEmpty)
    }

    @Test func aFailedSaveKeepsTheProfileAndShowsTheMessage() async {
        let api = StubAPI()
        api.updateProfileError = .message("Nope")
        var applied = false
        let m = model(api) { _ in applied = true }
        #expect(await m.saveName("Sam") == false)
        #expect(m.error == "Nope")
        #expect(m.profile == start)
        #expect(applied == false)
    }

    @Test func uploadPhotoSetsAndAppliesTheReturnedProfile() async {
        let api = StubAPI()
        var applied: Profile?
        let m = model(api) { applied = $0 }
        await m.uploadPhoto(Data([1, 2, 3]))
        #expect(api.calls == ["uploadAvatar(3)"])
        #expect(m.profile?.avatarURL != nil)
        #expect(applied?.avatarURL != nil)
        #expect(m.isUploading == false)
    }

    @Test func aFailedUploadShowsTheMessageAndLeavesTheProfile() async {
        let api = StubAPI()
        api.avatarResult = .failure(.message("Only JPEG, PNG, and WebP images are allowed"))
        let m = model(api)
        await m.uploadPhoto(Data([1]))
        #expect(m.error == "Only JPEG, PNG, and WebP images are allowed")
        #expect(m.profile == start)
        #expect(m.isUploading == false)
    }
}
