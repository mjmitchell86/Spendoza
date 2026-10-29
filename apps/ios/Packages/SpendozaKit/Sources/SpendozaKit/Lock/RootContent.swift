/// Which top-level screen the app shows. Everything signed-in goes through the lock.
public enum RootContent: Equatable, Sendable {
    case restoring, signIn, lock, loadFailed, onboarding, ready
}

public func rootContent(phase: AppPhase, isLocked: Bool, isRestoring: Bool, loadFailed: Bool) -> RootContent {
    if isRestoring { return .restoring }
    // A load failure means a session exists even though the phase is still signedOut.
    let signedIn = loadFailed || phase != .signedOut
    guard signedIn else { return .signIn }
    if isLocked { return .lock }
    if loadFailed { return .loadFailed }
    switch phase {
    case .signedOut: return .signIn
    case .onboarding: return .onboarding
    case .ready: return .ready
    }
}
