import Foundation
import Testing
@testable import SpendozaKit

struct ReportCacheTests {
    private func makeCache() -> (ReportCache, URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("cache-\(UUID().uuidString)")
        return (ReportCache(directory: dir), dir)
    }

    @Test func missingMonthIsNil() {
        let (cache, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
    }

    @Test func storedReportComesBackWithEveryField() throws {
        let (cache, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        let original = try Fixture.october
        cache.store(original)
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
        let (cache, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october)
        #expect(cache.load(month: Month(year: 2026, month: 9)) == nil)
    }

    @Test func clearRemovesEverything() throws {
        let (cache, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october)
        cache.store(try Fixture.september)
        cache.clear()
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
        #expect(cache.load(month: Month(year: 2026, month: 9)) == nil)
        // Still usable afterwards.
        cache.store(try Fixture.october)
        #expect(cache.load(month: Month(year: 2026, month: 10)) != nil)
    }

    @Test func corruptFileIsTreatedAsMissing() throws {
        let (cache, dir) = makeCache()
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october)
        for file in try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
            try Data("nope".utf8).write(to: file)
        }
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
    }
}

struct SignOutCleanupTests {
    @Test func snapshotStoreClears() {
        let suite = "test.spendoza.\(UUID().uuidString)"
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let store = SnapshotStore(appGroup: suite)
        store.save(WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: Month(year: 2026, month: 10)))
        store.clear()
        #expect(store.load() == nil)
    }

    @MainActor @Test func signOutRunsTheCleanupHook() async {
        let store = SessionStore(api: UnusedAPI())
        var ran = 0
        store.onSignOut = { ran += 1 }
        await store.signOut()
        #expect(ran == 1)
    }
}

private struct UnusedAPI: SpendozaAPI {
    func profile() async throws -> Profile { throw APIError.offline }
    func completeOnboarding() async throws {}
    func updateProfile(_ change: ProfileChange) async throws -> Profile { throw APIError.offline }
    func personalReport(_ month: Month) async throws -> Report? { nil }
    func categories() async throws -> [BudgetCategory] { [] }
    func transactions(from: Date, to: Date) async throws -> [Transaction] { [] }
    func setCategory(transactionID: String, category: String) async throws {}
    func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws {}
    func uploadStatement(fileURL: URL, mimeType: String) async throws -> Statement { throw APIError.offline }
    func statements() async throws -> [Statement] { [] }
    func reprocessStatement(id: String) async throws {}
    func removeStatement(id: String) async throws {}
    func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws {}
    func joinWaitlist(name: String, email: String) async throws {}
}
