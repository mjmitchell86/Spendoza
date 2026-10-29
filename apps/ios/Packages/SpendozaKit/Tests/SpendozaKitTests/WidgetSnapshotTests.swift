import Foundation
import Testing
@testable import SpendozaKit

struct WidgetSnapshotTests {
    private let snapshot = WidgetSnapshot(score: 72, band: .good, previousScore: 65, month: Month(year: 2026, month: 10))

    @Test func encodesExactlyFourKeys() throws {
        let data = try JSONEncoder().encode(snapshot)
        let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Set(object.keys) == ["score", "band", "previousScore", "month"])
    }

    @Test func nilPreviousScoreStillEncodesFourKeysOrOmitsOnlyThat() throws {
        let s = WidgetSnapshot(score: 30, band: .low, previousScore: nil, month: Month(year: 2026, month: 9))
        let data = try JSONEncoder().encode(s)
        let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        // 4.15: exactly the other three; a nil previous score is left out, never written as null.
        #expect(Set(object.keys) == ["score", "band", "month"])
    }

    @Test func bandIsStoredAsPlainString() throws {
        let data = try JSONEncoder().encode(snapshot)
        let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["band"] as? String == "good")
    }

    @Test func roundTrips() throws {
        let data = try JSONEncoder().encode(snapshot)
        #expect(try JSONDecoder().decode(WidgetSnapshot.self, from: data) == snapshot)
    }

    @Test func storeRoundTrips() {
        let suite = "test.spendoza.\(UUID().uuidString)"
        defer { UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite) }
        let store = SnapshotStore(appGroup: suite)
        #expect(store.load() == nil)
        store.save(snapshot)
        #expect(store.load() == snapshot)
        let nilPrev = WidgetSnapshot(score: 30, band: .low, previousScore: nil, month: Month(year: 2026, month: 9))
        store.save(nilPrev)
        #expect(store.load() == nilPrev)
    }
}
