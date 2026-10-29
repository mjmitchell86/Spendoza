/// Which top-level screen the app shows. Everything signed-in goes through the lock.
public enum RootContent: Equatable, Sendable {
    case restoring, signIn, loadFailed, onboarding, ready
}

/// The screen for this state. The lock is not a screen: it covers this one (see `lockCovers`), so locking and
/// unlocking keep the screen underneath built, with its navigation and any work in progress.
public func rootContent(phase: AppPhase, isRestoring: Bool, loadFailed: Bool) -> RootContent {
    if isRestoring { return .restoring }
    // A load failure means a session exists even though the phase is still signedOut.
    if loadFailed { return .loadFailed }
    switch phase {
    case .signedOut: return .signIn
    case .onboarding: return .onboarding
    case .ready: return .ready
    }
}

/// Whether the lock screen covers `content`. While covered, the screen underneath must be hidden from
/// assistive technologies and take no input.
public func lockCovers(_ content: RootContent, isLocked: Bool) -> Bool {
    guard isLocked else { return false }
    switch content {
    case .loadFailed, .onboarding, .ready: return true
    case .restoring, .signIn: return false
    }
}
