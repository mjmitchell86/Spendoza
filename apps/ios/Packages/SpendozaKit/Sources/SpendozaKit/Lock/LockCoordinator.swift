import Foundation

public enum LockScenePhase: Sendable { case active, inactive, background }

/// All lock decisions in one place; the UI only forwards events.
/// A restored session (cold launch) and every return from the background lock; only an explicit
/// interactive sign-in in this process starts unlocked.
@MainActor
public final class LockCoordinator {
    public let lock: AppLock
    private var hasSession = false

    public init(lock: AppLock) { self.lock = lock }

    /// Call once, after the stored session has been checked.
    public func launched(restoredSession: Bool) async {
        if restoredSession {
            hasSession = true
            await lock.appDidBecomeActive()
        } else {
            hasSession = false
            lock.sessionEnded()
        }
    }

    /// Raised only by a successful sign-in or sign-up typed in by the person.
    public func interactiveSignIn() {
        hasSession = true
        lock.sessionStartedFresh()
    }

    public func signedOut() {
        hasSession = false
        lock.sessionEnded()
    }

    public func scenePhaseChanged(to phase: LockScenePhase) async {
        guard hasSession else { return }
        switch phase {
        case .background: lock.appDidEnterBackground()
        case .active: await lock.appDidBecomeActive()
        case .inactive: break
        }
    }

    public func unlockTapped() async { await lock.unlockTapped() }
}
