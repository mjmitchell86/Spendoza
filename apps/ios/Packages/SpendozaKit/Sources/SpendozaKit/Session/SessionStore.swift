import Auth
import Foundation
import Observation

/// Maps a sign-in failure to copy: only an invalid-credentials answer says the details don't match.
public func signInError(_ error: Error) -> APIError {
    if let urlError = error as? URLError {
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .timedOut: return .offline
        default: return .message("Couldn't sign in. Try again.")
        }
    }
    if let authError = error as? AuthError, authError.errorCode == .invalidCredentials {
        return .message("That email and password don't match. Check them and try again.")
    }
    return .message("Couldn't sign in. Try again.")
}

/// The account was created but signing in afterwards failed; send the person to Sign in.
public struct AccountReadyError: Error, Equatable, Sendable {
    public let email: String
    public let message = "Your account is ready. Sign in to continue."
}

/// Creates the account, then signs in. A sign-in failure after a created account becomes `AccountReadyError`.
public func completeSignUp(email: String, createAccount: () async throws -> Void,
                           signIn: () async throws -> Void,
                           isolation: isolated (any Actor)? = #isolation) async throws {
    try await createAccount()
    do { try await signIn() } catch { throw AccountReadyError(email: email) }
}

/// Holds the Supabase session and the profile, and says which phase of the app to show.
/// Without Supabase settings (`config == nil`) the store stays signed out and `isConfigured` is false.
@MainActor @Observable
public final class SessionStore {
    public private(set) var phase: AppPhase = .signedOut
    /// True until the stored session (if any) has been checked on launch.
    public private(set) var isRestoring = true
    /// Set when a session exists but the profile couldn't be loaded (for example offline); show it with a retry.
    public private(set) var loadError: String?
    public private(set) var profile: Profile?
    public let isConfigured: Bool
    /// True when launch found a stored session (set once `restore()` finishes; false if it turned out invalid).
    public private(set) var restoredSession = false
    /// Raised by a successful interactive `signIn` / `signUp` only; never by `restore()`, `refresh()` or a retry.
    @ObservationIgnored public var onInteractiveSignIn: (@MainActor () -> Void)?
    /// Set when sign-up created an account but the follow-up sign-in failed; Sign in prefills this email and says the account is ready.
    public private(set) var accountReadyEmail: String?
    /// The Spendoza API, authorized with this store's session.
    @ObservationIgnored public private(set) var api: any SpendozaAPI

    @ObservationIgnored private let auth: AuthClient?
    @ObservationIgnored private var listener: Task<Void, Never>?

    public static let notConfiguredMessage = "This build isn't configured to sign in."

    public init(config: SupabaseConfig?, apiBaseURL: URL, urlSession: URLSession = .shared) {
        let auth = config.map {
            AuthClient(configuration: .init(
                url: $0.url.appendingPathComponent("auth/v1"),
                headers: ["apikey": $0.anonKey, "Authorization": "Bearer \($0.anonKey)"],
                localStorage: AuthClient.Configuration.defaultLocalStorage,
                emitLocalSessionAsInitialSession: true
            ))
        }
        self.auth = auth
        self.isConfigured = auth != nil
        self.api = APIClient(baseURL: apiBaseURL, session: urlSession) {
            guard let auth else { return nil }
            return try? await auth.session.accessToken
        }
    }

    /// Test seam: a store around any API with no Supabase client.
    public init(api: any SpendozaAPI) {
        self.auth = nil
        self.isConfigured = false
        self.api = api
    }

    public var accessToken: String? {
        get async {
            guard let auth else { return nil }
            return try? await auth.session.accessToken
        }
    }

    /// Restores the stored session on launch and keeps the phase in step with sign-outs.
    public func restore() async {
        defer { isRestoring = false }
        guard let auth else { return }
        listener = Task { [weak self] in
            for await (event, _) in auth.authStateChanges where event == .signedOut {
                self?.clear()
            }
        }
        guard auth.currentSession != nil else { return }
        await refresh()
        restoredSession = auth.currentSession != nil
    }

    public func signIn(email: String, password: String) async throws {
        guard let auth else { throw APIError.message(Self.notConfiguredMessage) }
        do {
            _ = try await auth.signIn(email: email, password: password)
        } catch {
            throw signInError(error)
        }
        onInteractiveSignIn?()
        await refresh()
    }

    /// Creates the account with an invite code, then signs in.
    public func signUp(displayName: String, email: String, password: String, inviteCode: String) async throws {
        guard isConfigured else { throw APIError.message(Self.notConfiguredMessage) }
        do {
            try await completeSignUp(
                email: email,
                createAccount: { [api] in
                    try await api.signUp(email: email, password: password, displayName: displayName, inviteCode: inviteCode)
                },
                signIn: { try await self.signIn(email: email, password: password) }
            )
        } catch let ready as AccountReadyError {
            accountReadyEmail = ready.email
            throw ready
        }
    }

    public func signOut() async {
        if let auth { try? await auth.signOut() }
        clear()
    }

    /// Reloads the profile and recomputes the phase.
    public func refresh() async {
        guard let auth, auth.currentSession != nil else { clear(); return }
        do {
            let profile = try await api.profile()
            self.profile = profile
            loadError = nil
            accountReadyEmail = nil
            phase = appPhase(session: true, profile: profile)
        } catch APIError.unauthorized {
            await signOut()
        } catch let error as APIError {
            loadError = error.userMessage
        } catch {
            loadError = "Couldn't load your account. Try again."
        }
    }

    private func clear() {
        accountReadyEmail = nil
        profile = nil
        loadError = nil
        phase = .signedOut
    }
}
