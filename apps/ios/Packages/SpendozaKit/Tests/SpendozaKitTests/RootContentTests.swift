import Testing
@testable import SpendozaKit

@Suite struct RootContentTests {
    private func content(_ phase: AppPhase, locked: Bool = false, restoring: Bool = false,
                         loadFailed: Bool = false) -> RootContent {
        rootContent(phase: phase, isLocked: locked, isRestoring: restoring, loadFailed: loadFailed)
    }

    @Test func lockedCoversEverySignedInScreen() {
        #expect(content(.onboarding, locked: true) == .lock)
        #expect(content(.ready(isAdmin: false), locked: true) == .lock)
        #expect(content(.signedOut, locked: true, loadFailed: true) == .lock)
    }

    @Test func unlockedShowsTheScreen() {
        #expect(content(.onboarding) == .onboarding)
        #expect(content(.ready(isAdmin: false)) == .ready)
        #expect(content(.signedOut, loadFailed: true) == .loadFailed)
    }

    @Test func signedOutAndRestoringIgnoreTheLock() {
        #expect(content(.signedOut, locked: true) == .signIn)
        #expect(content(.signedOut) == .signIn)
        #expect(content(.signedOut, locked: true, restoring: true) == .restoring)
        #expect(content(.ready(isAdmin: false), locked: true, restoring: true) == .restoring)
    }
}
