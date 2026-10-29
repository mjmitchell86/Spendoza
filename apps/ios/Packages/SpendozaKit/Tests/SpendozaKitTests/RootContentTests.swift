import Testing
@testable import SpendozaKit

@Suite struct RootContentTests {
    private func content(_ phase: AppPhase, restoring: Bool = false, loadFailed: Bool = false) -> RootContent {
        rootContent(phase: phase, isRestoring: restoring, loadFailed: loadFailed)
    }

    @Test func theLockCoversEverySignedInScreen() {
        #expect(lockCovers(.onboarding, isLocked: true))
        #expect(lockCovers(.ready, isLocked: true))
        #expect(lockCovers(.loadFailed, isLocked: true))
    }

    /// I1: locking only covers the screen; what's underneath stays the same screen (built, with its state).
    @Test func lockingKeepsTheSameScreenUnderneath() {
        #expect(content(.onboarding) == .onboarding)
        #expect(content(.ready(isAdmin: false)) == .ready)
        #expect(content(.signedOut, loadFailed: true) == .loadFailed)
    }

    @Test func unlockedCoversNothing() {
        for screen in [RootContent.onboarding, .ready, .loadFailed, .signIn, .restoring] {
            #expect(!lockCovers(screen, isLocked: false))
        }
    }

    @Test func signedOutAndRestoringIgnoreTheLock() {
        #expect(content(.signedOut) == .signIn)
        #expect(!lockCovers(.signIn, isLocked: true))
        #expect(content(.signedOut, restoring: true) == .restoring)
        #expect(content(.ready(isAdmin: false), restoring: true) == .restoring)
        #expect(!lockCovers(.restoring, isLocked: true))
    }
}
