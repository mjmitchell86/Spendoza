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

/// What a failure to get an access token from supabase-swift means for an API call.
///
/// `nil`: there is no usable session (none is stored, or the auth server rejected it), so the call is unauthorized.
/// Anything else is returned as the error to throw instead, and none of it may sign the person out: a network
/// failure while refreshing the token is `.offline` (the cached account stays usable), auth-server trouble is a
/// retryable message, and cancellation stays cancellation.
public func tokenFailure(for error: Error) -> Error? {
    let retry = APIError.message("Couldn't reach Spendoza. Try again.")
    if error is CancellationError { return error }
    if let urlError = error as? URLError {
        return urlError.code == .cancelled ? urlError : APIError.offline
    }
    if let apiError = error as? APIError { return apiError }
    guard let authError = error as? AuthError else { return retry }
    switch authError {
    case .sessionMissing:
        return nil
    case .api(_, let code, _, let response):
        // 4xx is the auth server rejecting this session (408 timeout and 429 rate limit are transient). A 4xx whose
        // body supabase-swift couldn't read (.unexpectedFailure) came from something in between, such as a CDN's
        // 403 page or a proxy's 407: not a rejection.
        let status = response.statusCode
        let rejected = (400..<500).contains(status) && status != 408 && status != 429 && code != .unexpectedFailure
        return rejected ? nil : retry
    default:
        return retry
    }
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
    /// Runs whenever the store drops to signed out (sign-out, an ended session): clear per-account caches here.
    @ObservationIgnored public var onSignOut: (@MainActor () -> Void)?
    /// Also runs whenever the store drops to signed out, even when the phase was already `.signedOut` (signing out
    /// from a load failure): the app lock listens here.
    @ObservationIgnored public var onSessionEnded: (@MainActor () -> Void)?
    /// Set when sign-up created an account but the follow-up sign-in failed; Sign in prefills this email and says the account is ready.
    public private(set) var accountReadyEmail: String?
    /// Why the person was signed out against their will (the account was disabled); Sign in shows it until the next successful sign-in.
    public private(set) var signedOutNotice: String?
    /// The Spendoza API, authorized with this store's session.
    @ObservationIgnored public private(set) var api: any SpendozaAPI

    /// Whose data the account caches hold; ended on sign-out so in-flight cache writes are dropped.
    @ObservationIgnored public let accountScope: AccountScope
    @ObservationIgnored private let profileCache: ProfileCache?
    /// The signed-in user's id, if a session is stored on this device (readable offline).
    @ObservationIgnored private let sessionUserID: @MainActor () -> String?
    @ObservationIgnored private let sessionEmail: @MainActor () -> String?
    @ObservationIgnored private let auth: AuthClient?
    /// Clears the store when supabase-swift signs the session out. One per store.
    @ObservationIgnored private(set) var signOutListener: Task<Void, Never>?

    public static let notConfiguredMessage = "This build isn't configured to sign in."

    public init(config: SupabaseConfig?, apiBaseURL: URL, urlSession: URLSession = .shared,
                accountScope: AccountScope = AccountScope(), profileCache: ProfileCache? = nil) {
        let auth = config.map {
            AuthClient(configuration: .init(
                url: $0.url.appendingPathComponent("auth/v1"),
                headers: ["apikey": $0.anonKey, "Authorization": "Bearer \($0.anonKey)"],
                localStorage: AuthClient.Configuration.defaultLocalStorage,
                emitLocalSessionAsInitialSession: true
            ))
        }
        self.auth = auth
        self.accountScope = accountScope
        self.profileCache = profileCache
        self.sessionUserID = { auth?.currentSession?.user.id.uuidString }
        self.sessionEmail = { auth?.currentSession?.user.email }
        self.isConfigured = auth != nil
        self.api = APIClient(baseURL: apiBaseURL, session: urlSession) {
            guard let auth else { return nil }
            do {
                // Refreshes an expired token, which needs the network.
                return try await auth.session.accessToken
            } catch {
                if let failure = tokenFailure(for: error) { throw failure }
                return nil
            }
        }
    }

    /// Test seam: a store around any API with no Supabase client.
    public init(api: any SpendozaAPI, userID: String? = nil, email: String? = nil, accountScope: AccountScope = AccountScope(),
                profileCache: ProfileCache? = nil) {
        self.accountScope = accountScope
        self.profileCache = profileCache
        self.sessionUserID = { userID }
        self.sessionEmail = { email }
        self.auth = nil
        self.isConfigured = false
        self.api = api
    }

    /// The signed-in user's email, from the stored Supabase session (the profile doesn't carry it).
    public var email: String? { sessionEmail() }

    public var accessToken: String? {
        get async {
            guard let auth else { return nil }
            return try? await auth.session.accessToken
        }
    }

    /// For a background launch that never ran `restore()`: points the account scope at the stored session's user
    /// (no network) so scoped writes work. Returns false when this device has no stored session.
    @discardableResult
    public func activateStoredSessionScope() -> Bool {
        guard let userID = sessionUserID() else { return false }
        accountScope.begin(userID: userID)
        return true
    }

    /// Restores the stored session on launch and keeps the phase in step with sign-outs.
    public func restore() async {
        defer { isRestoring = false }
        guard let auth else {
            // The test seam: a store given a user id stands for a stored session.
            restoredSession = sessionUserID() != nil
            return
        }
        listenForSignOuts(auth.authStateChanges)
        guard auth.currentSession != nil else {
            // No session: nothing on this device may belong to a previous account.
            clear()
            return
        }
        await refresh()
        restoredSession = auth.currentSession != nil
    }

    /// Starts the sign-out listener once; later calls (a second restore) do nothing.
    func listenForSignOuts(_ events: AsyncStream<(event: AuthChangeEvent, session: Session?)>) {
        guard signOutListener == nil else { return }
        signOutListener = Task { [weak self] in
            for await (event, _) in events where event == .signedOut {
                self?.clear()
            }
        }
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

    /// The server says this account was disabled: drop the local session and show `text` on Sign in.
    public func accountDisabled(_ text: String) async {
        if let auth { try? await auth.signOut(scope: .local) }
        clear()
        signedOutNotice = text
    }

    /// Replaces the profile after an edit, caching it the way a profile load does. A profile of anyone but the
    /// current session's user is dropped: a late save landing after sign-out or another sign-in must not overwrite
    /// the new user's profile or cache.
    public func apply(_ profile: Profile) {
        guard profile.id == sessionUserID() else { return }
        profileCache?.store(profile, token: accountScope.token())
        self.profile = profile
    }

    /// The server deleted this account: drop the local session without calling the server again.
    public func accountDeleted() async {
        if let auth { try? await auth.signOut(scope: .local) }
        clear()
    }

    /// Reloads the profile and recomputes the phase. Only an unauthorized answer signs out (the server's 401, or no
    /// usable session at all); being offline falls back to the cached profile, anything else shows a retry.
    public func refresh() async {
        guard let userID = sessionUserID() else { clear(); return }
        accountScope.begin(userID: userID)
        let token = accountScope.token()
        do {
            let profile = try await api.profile()
            // Signed out (or switched account) while the request was in flight: don't resurrect a signed-in state.
            guard accountScope.isCurrent(token) else { return }
            profileCache?.store(profile, token: token)
            self.profile = profile
            loadError = nil
            accountReadyEmail = nil
            signedOutNotice = nil
            phase = appPhase(session: true, profile: profile)
        } catch where !accountScope.isCurrent(token) {
            return
        } catch APIError.unauthorized {
            await signOut()
        } catch APIError.accountDisabled(let text) {
            await accountDisabled(text)
        } catch APIError.offline {
            // Offline launch: the last profile this user had decides the phase, so the cached check-up is reachable.
            if accountScope.isCurrent(token), let cached = profileCache?.load() {
                profile = cached
                loadError = nil
                phase = appPhase(session: true, profile: cached)
            } else {
                loadError = APIError.offline.userMessage
            }
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
        accountScope.end()
        onSignOut?()
        onSessionEnded?()
    }
}
