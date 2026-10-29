import Foundation
import LocalAuthentication
import Observation

/// Asks the person to prove it's them (Face ID, falling back to the device passcode).
public protocol Authenticator: Sendable {
    func authenticate(reason: String) async -> Bool
}

/// Face ID / Touch ID with passcode fallback (`.deviceOwnerAuthentication`).
/// A device with no passcode or biometrics set up can't be locked, so it counts as authenticated.
public struct DeviceAuthenticator: Authenticator {
    public init() {}

    public func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return true }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }
}

/// The app lock: locked on launch and after the app goes to the background, until the person authenticates.
@MainActor @Observable
public final class AppLock {
    public nonisolated static let defaultsKey = "faceIDLockEnabled"
    public nonisolated static let reason = "Unlock Spendoza."

    public private(set) var isLocked: Bool
    /// Whether the lock is on. Persisted; turning it off unlocks.
    public var isEnabled: Bool {
        didSet {
            defaults.set(isEnabled, forKey: Self.defaultsKey)
            if !isEnabled { isLocked = false }
        }
    }

    @ObservationIgnored private let authenticator: Authenticator
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var isAuthenticating = false

    public init(authenticator: Authenticator, isEnabled: Bool = AppLock.storedIsEnabled(in: .standard),
                defaults: UserDefaults = .standard) {
        self.authenticator = authenticator
        self.defaults = defaults
        self.isEnabled = isEnabled
        isLocked = isEnabled
    }

    /// The saved setting; on by default.
    public nonisolated static func storedIsEnabled(in defaults: UserDefaults) -> Bool {
        defaults.object(forKey: defaultsKey) as? Bool ?? true
    }

    /// Prompts to unlock when locked. Safe to call repeatedly; one prompt runs at a time.
    public func appDidBecomeActive() async {
        guard isEnabled, isLocked, !isAuthenticating else { return }
        isAuthenticating = true
        let ok = await authenticator.authenticate(reason: Self.reason)
        isAuthenticating = false
        if ok { isLocked = false }
    }

    public func appDidEnterBackground() {
        if isEnabled { isLocked = true }
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
