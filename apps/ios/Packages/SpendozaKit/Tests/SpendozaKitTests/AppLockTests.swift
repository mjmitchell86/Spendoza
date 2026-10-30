import Foundation
import Testing
@testable import SpendozaKit

private final class FakeAuthenticator: Authenticator, @unchecked Sendable {
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

@MainActor @Suite struct AppLockTests {
    private func defaults() -> UserDefaults {
        UserDefaults(suiteName: "AppLockTests-\(UUID().uuidString)")!
    }

    @Test func enabledStartsLockedUntilAuthenticated() async {
        let auth = FakeAuthenticator([true])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: defaults())
        #expect(lock.isLocked)
        await lock.appDidBecomeActive()
        #expect(!lock.isLocked)
        #expect(auth.calls == 1)
    }

    @Test func failedAuthenticationStaysLockedAndCanRetry() async {
        let auth = FakeAuthenticator([false, true])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: defaults())
        await lock.appDidBecomeActive()
        #expect(lock.isLocked)
        await lock.unlockTapped()
        #expect(!lock.isLocked)
    }

    @Test func failedAttemptIsNotRepromptedByActiveCycles() async {
        let auth = FakeAuthenticator([false, true])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: defaults())
        await lock.appDidBecomeActive()
        // The Face ID sheet toggles inactive -> active; that must not prompt again.
        await lock.appDidBecomeActive()
        await lock.appDidBecomeActive()
        #expect(auth.calls == 1)
        #expect(lock.isLocked)
        lock.appDidEnterBackground()
        await lock.appDidBecomeActive()
        #expect(auth.calls == 2)
        #expect(!lock.isLocked)
    }

    @Test func freshSignInStartsUnlockedWithoutPrompt() async {
        let auth = FakeAuthenticator([])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: defaults())
        lock.sessionStartedFresh()
        #expect(!lock.isLocked)
        await lock.appDidBecomeActive()
        #expect(auth.calls == 0)
    }

    @Test func restoredSessionAtLaunchIsLocked() {
        let lock = AppLock(authenticator: FakeAuthenticator([]), isEnabled: true, defaults: defaults())
        #expect(lock.isLocked)
    }

    @Test func backgroundWhileSignedOutThenFreshSignInIsUnlocked() async {
        let auth = FakeAuthenticator([])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: defaults())
        lock.sessionEnded()
        lock.appDidEnterBackground()
        lock.sessionStartedFresh()
        #expect(!lock.isLocked)
        await lock.appDidBecomeActive()
        #expect(auth.calls == 0)
    }

    @Test func turningOffRequiresAuthentication() async {
        let d = defaults()
        let auth = FakeAuthenticator([false, true])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: d)
        lock.sessionStartedFresh()
        await lock.setEnabled(false)
        #expect(lock.isEnabled)
        #expect(AppLock.storedIsEnabled(in: d))
        await lock.setEnabled(false)
        #expect(!lock.isEnabled)
        #expect(!AppLock.storedIsEnabled(in: d))
        await lock.setEnabled(true)
        #expect(lock.isEnabled)
        #expect(auth.calls == 2)
    }

    @Test func disabledIsNeverLocked() async {
        let auth = FakeAuthenticator([])
        let lock = AppLock(authenticator: auth, isEnabled: false, defaults: defaults())
        #expect(!lock.isLocked)
        await lock.appDidBecomeActive()
        lock.appDidEnterBackground()
        #expect(!lock.isLocked)
        await lock.appDidBecomeActive()
        #expect(auth.calls == 0)
    }

    @Test func backgroundThenActiveLocksAgain() async {
        let auth = FakeAuthenticator([true, true])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: defaults())
        await lock.appDidBecomeActive()
        #expect(!lock.isLocked)
        lock.appDidEnterBackground()
        #expect(lock.isLocked)
        await lock.appDidBecomeActive()
        #expect(!lock.isLocked)
        #expect(auth.calls == 2)
    }

    @Test func activeWhileUnlockedDoesNotPrompt() async {
        let auth = FakeAuthenticator([true])
        let lock = AppLock(authenticator: auth, isEnabled: true, defaults: defaults())
        await lock.appDidBecomeActive()
        await lock.appDidBecomeActive()
        #expect(auth.calls == 1)
    }

    @Test func storedDefaultIsEnabled() {
        #expect(AppLock.storedIsEnabled(in: defaults()))
    }
}

@Suite struct AppearanceTests {
    @Test func storedDefaultIsSystemAndRoundTrips() {
        let d = UserDefaults(suiteName: "AppearanceTests-\(UUID().uuidString)")!
        #expect(Appearance.stored(in: d) == .system)
        Appearance.dark.store(in: d)
        #expect(Appearance.stored(in: d) == .dark)
        d.set("bogus", forKey: Appearance.defaultsKey)
        #expect(Appearance.stored(in: d) == .system)
    }
}

@Suite struct DeviceAuthenticatorDecisionTests {
    @Test func onlyPasscodeNotSetMayPassWithoutAuthentication() {
        #expect(allowsWithoutAuthentication(NSError(domain: "com.apple.LocalAuthentication", code: -5)))
        #expect(!allowsWithoutAuthentication(NSError(domain: "com.apple.LocalAuthentication", code: -6)))
        #expect(!allowsWithoutAuthentication(NSError(domain: "com.apple.LocalAuthentication", code: -7)))
        #expect(!allowsWithoutAuthentication(nil))
    }
}
