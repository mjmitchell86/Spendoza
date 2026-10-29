import Foundation
import Testing
@testable import SpendozaKit

struct ReportCacheTests {
    private func makeCache(user: String? = "user-a") -> (ReportCache, AccountScope, URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("cache-\(UUID().uuidString)")
        let scope = AccountScope(userID: user)
        return (ReportCache(directory: dir, scope: scope), scope, dir)
    }

    @Test func missingMonthIsNil() {
        let (cache, _, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
    }

    @Test func storedReportComesBackWithEveryField() throws {
        let (cache, scope, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        let original = try Fixture.october
        cache.store(original, token: scope.token())
        let loaded = try #require(cache.load(month: Month(year: 2026, month: 10)))
        #expect(loaded.month == original.month)
        #expect(loaded.insights == original.insights)
        #expect(abs(loaded.generatedAt.timeIntervalSince(original.generatedAt)) < 0.001)
        #expect(loaded.data.totalIncome == original.data.totalIncome)
        #expect(loaded.data.totalExpenses == original.data.totalExpenses)
        #expect(loaded.data.savingsRate == original.data.savingsRate)
        #expect(loaded.data.byCategory == original.data.byCategory)
        let health = try #require(loaded.data.health)
        let expected = try #require(original.data.health)
        #expect(health.score == expected.score)
        #expect(health.previousScore == expected.previousScore)
        #expect(health.parts == expected.parts)
    }

    @Test func otherMonthsAreSeparate() throws {
        let (cache, scope, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, token: scope.token())
        #expect(cache.load(month: Month(year: 2026, month: 9)) == nil)
    }

    @Test func clearRemovesEverything() throws {
        let (cache, scope, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, token: scope.token())
        cache.store(try Fixture.september, token: scope.token())
        cache.clear()
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
        #expect(cache.load(month: Month(year: 2026, month: 9)) == nil)
        cache.store(try Fixture.october, token: scope.token())
        #expect(cache.load(month: Month(year: 2026, month: 10)) != nil)
    }

    @Test func corruptFileIsTreatedAsMissing() throws {
        let (cache, scope, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, token: scope.token())
        let files = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: [.isRegularFileKey])!
        for case let file as URL in files where file.pathExtension == "json" {
            try Data("nope".utf8).write(to: file)
        }
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
    }

    // MARK: Per user

    @Test func filesLiveUnderTheUsersFolder() throws {
        let (cache, scope, dir) = makeCache(user: "user-a")
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, token: scope.token())
        let file = dir.appendingPathComponent("user-a").appendingPathComponent("report-2026-10-01.json")
        #expect(FileManager.default.fileExists(atPath: file.path))
    }

    @Test func anotherUserNeverSeesTheFirstUsersReports() throws {
        let (cache, scope, dir) = makeCache(user: "user-a")
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, token: scope.token())
        scope.begin(userID: "user-b")
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
        scope.begin(userID: "user-a")
        #expect(cache.load(month: Month(year: 2026, month: 10)) != nil)
    }

    @Test func noUserMeansNothingIsStoredOrLoaded() throws {
        let (cache, scope, dir) = makeCache(user: nil)
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, token: scope.token())
        #expect(!FileManager.default.fileExists(atPath: dir.path))
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
    }

    @Test func unsafeUserIDsAreRefused() throws {
        let (cache, scope, dir) = makeCache(user: "../evil")
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, token: scope.token())
        #expect(!FileManager.default.fileExists(atPath: dir.path))
    }

    // MARK: Generation

    @Test func aWriteStartedBeforeSignOutIsDropped() throws {
        let (cache, scope, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        let token = scope.token()
        scope.end()
        cache.clear()
        cache.store(try Fixture.october, token: token)
        scope.begin(userID: "user-a")
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
    }

    @Test func aWriteWithTheCurrentGenerationLands() throws {
        let (cache, scope, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        scope.begin(userID: "user-a")   // same user: no bump
        cache.store(try Fixture.october, token: scope.token())
        #expect(cache.load(month: Month(year: 2026, month: 10)) != nil)
    }

    @Test func snapshotWriteIsDroppedAfterSignOut() {
        let suite = "test.spendoza.\(UUID().uuidString)"
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let scope = AccountScope(userID: "user-a")
        let store = SnapshotStore(appGroup: suite)
        let snapshot = WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: Month(year: 2026, month: 10))
        let token = scope.token()
        scope.end()
        store.save(snapshot, token: token, scope: scope)
        #expect(store.load() == nil)
        scope.begin(userID: "user-a")
        store.save(snapshot, token: scope.token(), scope: scope)
        #expect(store.load() == snapshot)
    }
}

struct ProfileCacheTests {
    @Test func profileRoundTripsPerUser() {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("p-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let scope = AccountScope(userID: "user-a")
        let cache = ProfileCache(directory: dir, scope: scope)
        let profile = Profile(id: "user-a", displayName: "A", onboardingCompleted: true, isAdmin: false,
                              emailReportsEnabled: true, householdID: nil, timezone: "America/Chicago")
        #expect(cache.load() == nil)
        cache.store(profile, token: scope.token())
        #expect(cache.load() == profile)
        scope.begin(userID: "user-b")
        #expect(cache.load() == nil)
    }
}

struct SignOutCleanupTests {
    @Test func snapshotStoreClears() {
        let suite = "test.spendoza.\(UUID().uuidString)"
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let scope = AccountScope(userID: "user-a")
        let store = SnapshotStore(appGroup: suite)
        store.save(WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: Month(year: 2026, month: 10)),
                   token: scope.token(), scope: scope)
        store.clear()
        #expect(store.load() == nil)
    }

    @MainActor @Test func signOutRunsTheCleanupHookAndEndsTheScope() async {
        let scope = AccountScope(userID: "user-a")
        let store = SessionStore(api: UnusedAPI(), accountScope: scope)
        var ran = 0
        store.onSignOut = { ran += 1 }
        let token = scope.token()
        await store.signOut()
        #expect(ran == 1)
        #expect(!scope.isCurrent(token))
        #expect(scope.userID == nil)
    }
}

@MainActor
struct OfflineLaunchTests {
    private func profile(done: Bool) -> Profile {
        Profile(id: "user-a", displayName: "A", onboardingCompleted: done, isAdmin: false,
                emailReportsEnabled: true, householdID: nil)
    }

    private func make(api: OfflineAPI, cache: ProfileCache, scope: AccountScope) -> SessionStore {
        SessionStore(api: api, userID: "user-a", accountScope: scope, profileCache: cache)
    }

    @Test func offlineLaunchUsesTheCachedProfile() async {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("p-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let scope = AccountScope(userID: "user-a")
        let cache = ProfileCache(directory: dir, scope: scope)
        cache.store(profile(done: true), token: scope.token())
        let store = make(api: OfflineAPI(result: .failure(.offline)), cache: cache, scope: scope)
        await store.refresh()
        #expect(store.phase == .ready(isAdmin: false))
        #expect(store.loadError == nil)
    }

    @Test func offlineWithNoCachedProfileStillFails() async {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("p-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let scope = AccountScope(userID: "user-a")
        let store = make(api: OfflineAPI(result: .failure(.offline)), cache: ProfileCache(directory: dir, scope: scope), scope: scope)
        await store.refresh()
        #expect(store.loadError == APIError.offline.userMessage)
        #expect(store.phase == .signedOut)
    }

    @Test func otherErrorsDoNotFallBackToTheCache() async {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("p-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let scope = AccountScope(userID: "user-a")
        let cache = ProfileCache(directory: dir, scope: scope)
        cache.store(profile(done: true), token: scope.token())
        let store = make(api: OfflineAPI(result: .failure(.message("boom"))), cache: cache, scope: scope)
        await store.refresh()
        #expect(store.loadError == "boom")
    }

    @Test func aFreshProfileIsCachedForNextTime() async {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("p-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let scope = AccountScope(userID: "user-a")
        let cache = ProfileCache(directory: dir, scope: scope)
        let store = make(api: OfflineAPI(result: .success(profile(done: true))), cache: cache, scope: scope)
        await store.refresh()
        #expect(cache.load() == profile(done: true))
    }

    @Test func aSeamStoreWithoutASessionClearsInstead() async {
        let scope = AccountScope()
        let store = SessionStore(api: OfflineAPI(result: .failure(.offline)), userID: nil, accountScope: scope, profileCache: nil)
        await store.refresh()
        #expect(store.phase == .signedOut)
    }
}

private struct OfflineAPI: SpendozaAPI {
    let result: Result<Profile, APIError>
    func profile() async throws -> Profile { try result.get() }
    func completeOnboarding() async throws {}
    func updateProfile(_ change: ProfileChange) async throws -> Profile { throw APIError.offline }
    func personalReport(_ month: Month) async throws -> Report? { nil }
    func categories() async throws -> [BudgetCategory] { [] }
    func transactions(from: Date, to: Date) async throws -> [Transaction] { [] }
    func transactions(statementID: String) async throws -> [Transaction] { [] }
    func setCategory(transactionID: String, category: String) async throws {}
    func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws {}
    func uploadStatement(fileURL: URL, mimeType: String, bankName: String?) async throws -> Statement { throw APIError.offline }
    func statements() async throws -> [Statement] { [] }
    func reprocessStatement(id: String) async throws {}
    func removeStatement(id: String) async throws {}
    func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws {}
    func joinWaitlist(name: String, email: String) async throws {}
}

private typealias UnusedAPI = OfflineAPI

extension OfflineAPI {
    init() { self.init(result: .failure(.offline)) }
}

/// Holds `profile()` open until the test lets it go.
private final class Gate: @unchecked Sendable {
    private let lock = NSLock()
    private var _arrived = false
    private var _open = false
    var arrived: Bool { lock.withLock { _arrived } }
    func pass() async {
        lock.withLock { _arrived = true }
        while !lock.withLock({ _open }) { try? await Task.sleep(for: .milliseconds(5)) }
    }
    func open() { lock.withLock { _open = true } }
}

private struct GatedAPI: SpendozaAPI {
    let gate: Gate
    let result: Profile
    func profile() async throws -> Profile { await gate.pass(); return result }
    func completeOnboarding() async throws {}
    func updateProfile(_ change: ProfileChange) async throws -> Profile { result }
    func personalReport(_ month: Month) async throws -> Report? { nil }
    func categories() async throws -> [BudgetCategory] { [] }
    func transactions(from: Date, to: Date) async throws -> [Transaction] { [] }
    func transactions(statementID: String) async throws -> [Transaction] { [] }
    func setCategory(transactionID: String, category: String) async throws {}
    func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws {}
    func uploadStatement(fileURL: URL, mimeType: String, bankName: String?) async throws -> Statement { throw APIError.offline }
    func statements() async throws -> [Statement] { [] }
    func reprocessStatement(id: String) async throws {}
    func removeStatement(id: String) async throws {}
    func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws {}
    func joinWaitlist(name: String, email: String) async throws {}
}

@MainActor
struct RefreshRaceTests {
    @Test func signOutDuringARefreshLeavesTheStoreSignedOut() async {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("p-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let scope = AccountScope(userID: "user-a")
        let cache = ProfileCache(directory: dir, scope: scope)
        let gate = Gate()
        let profile = Profile(id: "user-a", displayName: "A", onboardingCompleted: true, isAdmin: false,
                              emailReportsEnabled: true, householdID: nil)
        let store = SessionStore(api: GatedAPI(gate: gate, result: profile), userID: "user-a",
                                 accountScope: scope, profileCache: cache)
        let refresh = Task { await store.refresh() }
        while !gate.arrived { await Task.yield() }
        await store.signOut()
        gate.open()
        await refresh.value
        #expect(store.phase == .signedOut)
        #expect(store.profile == nil)
        scope.begin(userID: "user-a")
        #expect(cache.load() == nil)
    }
}
