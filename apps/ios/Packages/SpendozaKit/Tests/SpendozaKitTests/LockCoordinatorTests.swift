import Foundation
import Testing
@testable import SpendozaKit

private final class FakeAuth: Authenticator, @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Bool]
    private var count = 0
    init(_ results: [Bool]) { self.results = results }
    var calls: Int { lock.withLock { count } }
    func authenticate(reason: String) async -> Bool {
        lock.withLock {
            count += 1
            return results.isEmpty ? false : results.removeFirst()
        }
    }
}

@MainActor @Suite struct LockCoordinatorTests {
    private func make(_ results: [Bool]) -> (LockCoordinator, FakeAuth) {
        let auth = FakeAuth(results)
        let d = UserDefaults(suiteName: "LockCoordinatorTests-\(UUID().uuidString)")!
        return (LockCoordinator(lock: AppLock(authenticator: auth, isEnabled: true, defaults: d)), auth)
    }

    @Test func coldLaunchWithRestoredSessionPromptsAndUnlocks() async {
        let (c, auth) = make([true])
        await c.launched(restoredSession: true)
        #expect(auth.calls == 1)
        #expect(!c.lock.isLocked)
    }

    @Test func cancelledPromptStaysLockedThroughSheetBounceUntilUnlockTapped() async {
        let (c, auth) = make([false, true])
        await c.launched(restoredSession: true)
        #expect(auth.calls == 1)
        #expect(c.lock.isLocked)
        await c.scenePhaseChanged(to: .inactive)
        await c.scenePhaseChanged(to: .active)
        #expect(auth.calls == 1)
        #expect(c.lock.isLocked)
        await c.unlockTapped()
        #expect(auth.calls == 2)
        #expect(!c.lock.isLocked)
    }

    @Test func coldLaunchSignedOutThenInteractiveSignInIsUnlockedWithoutPrompt() async {
        let (c, auth) = make([])
        await c.launched(restoredSession: false)
        c.interactiveSignIn()
        await c.scenePhaseChanged(to: .active)
        #expect(auth.calls == 0)
        #expect(!c.lock.isLocked)
    }

    @Test func backgroundThenActivePromptsOnce() async {
        let (c, auth) = make([true])
        await c.launched(restoredSession: false)
        c.interactiveSignIn()
        await c.scenePhaseChanged(to: .background)
        #expect(c.lock.isLocked)
        await c.scenePhaseChanged(to: .active)
        #expect(auth.calls == 1)
        #expect(!c.lock.isLocked)
    }

    @Test func signOutThenBackgroundThenSignInAsSomeoneElseIsUnlocked() async {
        let (c, auth) = make([])
        await c.launched(restoredSession: false)
        c.interactiveSignIn()
        c.signedOut()
        await c.scenePhaseChanged(to: .background)
        await c.scenePhaseChanged(to: .active)
        c.interactiveSignIn()
        #expect(auth.calls == 0)
        #expect(!c.lock.isLocked)
    }

    @Test func restoredSessionWhoseProfileLoadFailedStaysLockedAfterRetry() async {
        // Restore found a session, the profile load failed offline, "Try again" later succeeds:
        // neither is an interactive sign-in, so the lock is never skipped.
        let (c, auth) = make([false, true])
        await c.launched(restoredSession: true)
        #expect(c.lock.isLocked)
        // (store.refresh() succeeding raises no lock event)
        #expect(c.lock.isLocked)
        await c.unlockTapped()
        #expect(auth.calls == 2)
        #expect(!c.lock.isLocked)
    }

    @Test func signedOutBackgroundAndActiveNeverPrompt() async {
        let (c, auth) = make([])
        await c.launched(restoredSession: false)
        await c.scenePhaseChanged(to: .background)
        await c.scenePhaseChanged(to: .active)
        #expect(auth.calls == 0)
    }
}
