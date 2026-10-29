import Foundation
import LocalAuthentication
import Observation

/// Asks the person to prove it's them (Face ID, falling back to the device passcode).
public protocol Authenticator: Sendable {
    func authenticate(reason: String) async -> Bool
}

/// Whether a failure to evaluate the policy means there is nothing to prove: only "no passcode set".
/// Every other error keeps the app locked.
public func allowsWithoutAuthentication(_ error: NSError?) -> Bool {
    guard let error else { return false }
    return error.domain == LAError.errorDomain && error.code == LAError.passcodeNotSet.rawValue
}

/// Face ID / Touch ID with passcode fallback (`.deviceOwnerAuthentication`).
public struct DeviceAuthenticator: Authenticator {
    public init() {}

    public func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            return allowsWithoutAuthentication(error)
        }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }
}

/// The app lock. A launch with a restored session and every return from the background start locked;
/// a fresh sign-in in this process starts unlocked. The system prompt appears automatically once per
/// lock; after a failed or cancelled attempt the person taps Unlock.
@MainActor @Observable
public final class AppLock {
    public nonisolated static let defaultsKey = "faceIDLockEnabled"
    public nonisolated static let reason = "Unlock Spendoza."

    public private(set) var isLocked: Bool
    /// Whether the lock is on. Persisted; change it with `setEnabled`.
    public private(set) var isEnabled: Bool

    @ObservationIgnored private let authenticator: Authenticator
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var isAuthenticating = false
    @ObservationIgnored private var autoPromptPending: Bool

    public init(authenticator: Authenticator, isEnabled: Bool = AppLock.storedIsEnabled(in: .standard),
                defaults: UserDefaults = .standard) {
        self.authenticator = authenticator
        self.defaults = defaults
        self.isEnabled = isEnabled
        isLocked = isEnabled
        autoPromptPending = isEnabled
    }

    /// The saved setting; on by default.
    public nonisolated static func storedIsEnabled(in defaults: UserDefaults) -> Bool {
        defaults.object(forKey: defaultsKey) as? Bool ?? true
    }

    /// Prompts automatically, once per lock (launch or return from background). Later calls, such as the
    /// inactive -> active cycle the Face ID sheet causes, do nothing until the Unlock button.
    public func appDidBecomeActive() async {
        guard autoPromptPending else { return }
        autoPromptPending = false
        await attempt()
    }

    /// The Unlock button.
    public func unlockTapped() async { await attempt() }

    public func appDidEnterBackground() {
        guard isEnabled else { return }
        isLocked = true
        autoPromptPending = true
    }

    /// The person signed in during this process: nothing to protect yet.
    public func sessionStartedFresh() {
        isLocked = false
        autoPromptPending = false
    }

    /// Signed out: reset so the next sign-in starts unlocked too.
    public func sessionEnded() { sessionStartedFresh() }

    /// Turning the lock off needs a successful authentication; turning it on does not.
    public func setEnabled(_ on: Bool) async {
        if on {
            isEnabled = true
        } else {
            guard !isAuthenticating else { return }
            isAuthenticating = true
            let ok = await authenticator.authenticate(reason: Self.reason)
            isAuthenticating = false
            guard ok else { return }
            isEnabled = false
            isLocked = false
        }
        defaults.set(isEnabled, forKey: Self.defaultsKey)
    }

    private func attempt() async {
        guard isEnabled, isLocked, !isAuthenticating else { return }
        isAuthenticating = true
        let ok = await authenticator.authenticate(reason: Self.reason)
        isAuthenticating = false
        if ok { isLocked = false }
    }
}

/// The colour-scheme choice in Me → Appearance & Face ID.
public enum Appearance: String, CaseIterable, Sendable {
    case system, light, dark

    public static let defaultsKey = "appearance"

    public static func stored(in defaults: UserDefaults) -> Appearance {
        defaults.string(forKey: defaultsKey).flatMap(Appearance.init(rawValue:)) ?? .system
    }

    public func store(in defaults: UserDefaults) {
        defaults.set(rawValue, forKey: Self.defaultsKey)
    }

    public var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}
