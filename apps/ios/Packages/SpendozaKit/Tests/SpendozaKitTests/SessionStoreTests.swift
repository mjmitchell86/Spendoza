import Auth
import Foundation
import Testing
@testable import SpendozaKit

/// C1: what a failure to get an access token from supabase-swift means. Only "there is no usable session" may
/// lead to a sign-out; a network failure while refreshing the token is the person being offline.
struct AccessTokenFailureTests {
    private func apiError(status: Int, code: ErrorCode = .unknown) -> AuthError {
        .api(message: "x", errorCode: code, underlyingData: Data(),
             underlyingResponse: HTTPURLResponse(url: URL(string: "https://x.supabase.co/auth/v1/token")!,
                                                 statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    @Test func noStoredSessionMeansNoToken() {
        #expect(tokenFailure(for: AuthError.sessionMissing) == nil)
    }

    @Test func theAuthServerRejectingTheSessionMeansNoToken() {
        #expect(tokenFailure(for: apiError(status: 400, code: .badJWT)) == nil)
        #expect(tokenFailure(for: apiError(status: 403, code: .userBanned)) == nil)
    }

    @Test(arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost,
                      .cannotConnectToHost, .dataNotAllowed])
    func aNetworkFailureIsOffline(code: URLError.Code) {
        #expect(tokenFailure(for: URLError(code)) as? APIError == .offline)
    }

    @Test func authServerTroubleIsRetryableNotASignOut() throws {
        for status in [429, 500, 503] {
            let error = try #require(tokenFailure(for: apiError(status: status)) as? APIError)
            #expect(error != .unauthorized)
            #expect(error != .offline)
        }
        let discarded = try #require(tokenFailure(for: AuthError.refreshDiscarded) as? APIError)
        #expect(discarded != .unauthorized)
    }

    @Test func cancellationStaysCancellation() {
        #expect(tokenFailure(for: CancellationError()) is CancellationError)
        #expect((tokenFailure(for: URLError(.cancelled)) as? URLError)?.code == .cancelled)
    }

    @Test func anythingElseIsNotASignOut() throws {
        struct Odd: Error {}
        let error = try #require(tokenFailure(for: Odd()) as? APIError)
        #expect(error != .unauthorized)
    }
}

/// C1, end to end with the real `APIClient`: the token refresh can't reach the network on a cold launch.
@MainActor
struct OfflineColdLaunchTests {
    @Test func aTokenRefreshThatCantReachTheNetworkShowsTheCachedAccount() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("cold-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let scope = AccountScope(userID: "user-a")
        let profiles = ProfileCache(directory: dir, scope: scope)
        let reports = ReportCache(directory: dir, scope: scope)
        let profile = Profile(id: "user-a", displayName: "A", onboardingCompleted: true, isAdmin: false,
                              emailReportsEnabled: true, householdID: nil)
        profiles.store(profile, token: scope.token())
        reports.store(try Fixture.october, token: scope.token())

        let api = APIClient(baseURL: URL(string: "https://api.example.test")!, session: StubURLProtocol.session(),
                            accessToken: { throw URLError(.notConnectedToInternet) })
        let store = SessionStore(api: api, userID: "user-a", accountScope: scope, profileCache: profiles)
        var signedOut = 0
        store.onSignOut = { signedOut += 1 }

        await store.refresh()

        #expect(store.phase == .ready(isAdmin: false))
        #expect(store.profile == profile)
        #expect(store.loadError == nil)
        #expect(signedOut == 0)
        #expect(scope.userID == "user-a")
        #expect(profiles.load() == profile)
        #expect(reports.load(month: Month(year: 2026, month: 10)) != nil)
    }

    @Test func onlyAnUnauthorizedAnswerSignsOut() async {
        let scope = AccountScope(userID: "user-a")
        let api = APIClient(baseURL: URL(string: "https://api.example.test")!, session: StubURLProtocol.session(),
                            accessToken: { throw APIError.message("Couldn't reach Spendoza. Try again.") })
        let store = SessionStore(api: api, userID: "user-a", accountScope: scope)
        var signedOut = 0
        store.onSignOut = { signedOut += 1 }
        await store.refresh()
        #expect(signedOut == 0)
        #expect(store.loadError == "Couldn't reach Spendoza. Try again.")
    }
}

/// Holds `profile()` open until the test lets it go, then fails it.
private final class FailGate: @unchecked Sendable {
    private let lock = NSLock()
    private var _arrived = false
    private var _open = false
    var arrived: Bool { lock.withLock { _arrived } }
    func pass() async {
        lock.withLock { _arrived = true }
        while !lock.withLock({ _open }) { await Task.yield() }
    }
    func open() { lock.withLock { _open = true } }
}

private struct FailingAPI: SpendozaAPI {
    var gate: FailGate?
    let error: APIError
    func profile() async throws -> Profile { await gate?.pass(); throw error }
    func completeOnboarding() async throws {}
    func updateProfile(_ change: ProfileChange) async throws -> Profile { throw error }
    func personalReport(_ month: Month) async throws -> Report? { nil }
    func categories() async throws -> [BudgetCategory] { [] }
    func transactions(from: Date, to: Date) async throws -> [Transaction] { [] }
    func transactions(statementID: String) async throws -> [Transaction] { [] }
    func setCategory(transactionID: String, category: String?) async throws {}
    func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws {}
    func uploadStatement(fileURL: URL, mimeType: String, bankName: String?) async throws -> Statement { throw error }
    func statements() async throws -> [Statement] { [] }
    func reprocessStatement(id: String) async throws {}
    func removeStatement(id: String) async throws {}
    func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws {}
    func joinWaitlist(name: String, email: String) async throws {}
}

@MainActor
struct RefreshErrorRaceTests {
    /// 9.48: a refresh that fails after the person signed out mustn't show a load error over the sign-in screen.
    @Test func aFailureArrivingAfterSignOutIsDropped() async {
        let scope = AccountScope(userID: "user-a")
        let gate = FailGate()
        let store = SessionStore(api: FailingAPI(gate: gate, error: .message("boom")), userID: "user-a", accountScope: scope)
        let refresh = Task { await store.refresh() }
        while !gate.arrived { await Task.yield() }
        await store.signOut()
        gate.open()
        await refresh.value
        #expect(store.phase == .signedOut)
        #expect(store.loadError == nil)
    }

    @Test func anUnauthorizedArrivingAfterSignOutDoesNotSignOutAgain() async {
        let scope = AccountScope(userID: "user-a")
        let gate = FailGate()
        let store = SessionStore(api: FailingAPI(gate: gate, error: .unauthorized), userID: "user-a", accountScope: scope)
        var signedOut = 0
        store.onSignOut = { signedOut += 1 }
        let refresh = Task { await store.refresh() }
        while !gate.arrived { await Task.yield() }
        await store.signOut()
        gate.open()
        await refresh.value
        #expect(signedOut == 1)
    }
}

@MainActor
struct SessionEndedHookTests {
    /// 7.31: signing out from "Couldn't load your account" (phase already .signedOut) must still reach the lock.
    @Test func signingOutFromALoadFailureRaisesTheSessionEndedHook() async {
        let store = SessionStore(api: FailingAPI(error: .message("boom")), userID: "user-a")
        await store.refresh()
        #expect(store.phase == .signedOut)
        #expect(store.loadError == "boom")
        var ended = 0
        store.onSessionEnded = { ended += 1 }
        await store.signOut()
        #expect(ended == 1)
        #expect(store.loadError == nil)
    }

    @Test func afterThatTheLockNoLongerPromptsOnTheSignInScreen() async {
        let store = SessionStore(api: FailingAPI(error: .message("boom")), userID: "user-a")
        let lock = AppLock(authenticator: CountingAuthenticator(), isEnabled: true,
                           defaults: UserDefaults(suiteName: "test.spendoza.\(UUID().uuidString)")!)
        let coordinator = LockCoordinator(lock: lock)
        store.onSessionEnded = { coordinator.signedOut() }
        await coordinator.launched(restoredSession: true)
        await store.refresh()
        await store.signOut()
        await coordinator.scenePhaseChanged(to: .background)
        #expect(!lock.isLocked)
    }
}

private struct CountingAuthenticator: Authenticator {
    func authenticate(reason: String) async -> Bool { true }
}

@MainActor
struct SignOutListenerTests {
    /// 6.24: restoring twice must not start a second auth listener (each one would clear the account again).
    @Test func listeningTwiceKeepsOneListener() async {
        let store = SessionStore(api: FailingAPI(error: .offline), userID: "user-a")
        var cleared = 0
        store.onSignOut = { cleared += 1 }
        let (first, firstEvents) = AsyncStream<(event: AuthChangeEvent, session: Session?)>.makeStream()
        let (second, secondEvents) = AsyncStream<(event: AuthChangeEvent, session: Session?)>.makeStream()
        store.listenForSignOuts(first)
        store.listenForSignOuts(second)
        for events in [firstEvents, secondEvents] {
            events.yield((event: .signedOut, session: nil))
            events.finish()
        }
        await store.signOutListener?.value
        // Let a second listener (if one was started) run too.
        for _ in 0..<20 { await Task.yield() }
        #expect(cleared == 1)
    }
}
