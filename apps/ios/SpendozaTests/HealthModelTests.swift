import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct HealthModelTests {
    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()
    /// 2026-11-14: October is the check-up, November is in progress.
    private let now = Date(timeIntervalSince1970: 1_794_614_400)
    private let sep = StubAPI.sep, oct = StubAPI.oct, nov = StubAPI.nov, aug = StubAPI.aug

    private struct Harness {
        let model: HealthModel
        let cache: ReportCache
        let snapshots: SnapshotStore
        let cleanup: () -> Void
    }

    private func harness(_ api: StubAPI, cache existing: ReportCache? = nil) -> Harness {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("health-\(UUID().uuidString)")
        let suite = "test.spendoza.\(UUID().uuidString)"
        let cache = existing ?? ReportCache(directory: dir)
        let snapshots = SnapshotStore(appGroup: suite)
        let model = HealthModel(api: api, cache: cache, snapshots: snapshots, calendar: Self.calendar)
        return Harness(model: model, cache: cache, snapshots: snapshots, cleanup: {
            try? FileManager.default.removeItem(at: dir)
            UserDefaults().removePersistentDomain(forName: suite)
        })
    }

    private func loaded(_ model: HealthModel) throws -> HealthSnapshot {
        guard case .loaded(let snapshot) = model.state else {
            Issue.record("expected .loaded, got \(model.state)")
            throw CancellationError()
        }
        return snapshot
    }

    @Test func loadsOctoberAsTheCheckupWithSeptemberBeforeAndNovemberSoFar() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)

        let snapshot = try loaded(h.model)
        #expect(snapshot.report.month == oct)
        #expect(snapshot.previous?.month == sep)
        #expect(snapshot.history.map(\.month) == [sep, aug])
        #expect(snapshot.soFar?.month == nov)
        #expect(!snapshot.isCached)
        #expect(h.model.selectedMonth == oct)
        #expect(h.model.availableMonths == [nov, oct, sep, aug])
    }

    @Test func partsComeInSpecOrderWithWantsDownSix() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)

        let parts = try loaded(h.model).parts
        #expect(parts.map(\.part) == [.savingsRate, .needs, .wants, .emergencyFund, .debtToIncome])
        let wants = try #require(parts.first { $0.part == .wants })
        #expect(wants.points == 9 && wants.max == 15 && wants.delta == -6)
        #expect(parts.first { $0.part == .needs }?.delta == 0)
    }

    @Test func requestsTheCurrentMonthAndTheFiveBefore() async {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        let expected = Set((6...11).map { Month(year: 2026, month: $0) })
        #expect(Set(api.requestedMonths) == expected)
        #expect(api.requestedMonths.count == 6)
    }

    @Test func savesTheWidgetSnapshotForTheCheckup() async {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        #expect(h.snapshots.load() == WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: oct))
    }

    @Test func offersOneSuggestion() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        let suggestion = try #require(try loaded(h.model).suggestion)
        #expect(!suggestion.title.isEmpty)
    }

    @Test func noReportsAtAllIsEmpty() async {
        let h = harness(StubAPI())
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .empty = h.model.state else { Issue.record("expected .empty, got \(h.model.state)"); return }
        #expect(h.snapshots.load() == nil)
    }

    @Test func onlyTheInProgressMonthIsStillEmpty() async {
        let api = StubAPI()
        api.reports = [nov: StubAPI.standardReports()[nov]!]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .empty = h.model.state else { Issue.record("expected .empty, got \(h.model.state)"); return }
    }

    @Test func offlineAfterACachedOctoberShowsTheCachedCheckup() async throws {
        let online = StubAPI()
        online.reports = StubAPI.standardReports()
        let first = harness(online)
        defer { first.cleanup() }
        await first.model.load(now: now)

        let offline = StubAPI()
        offline.reportError = .offline
        let second = harness(offline, cache: first.cache)
        defer { second.cleanup() }
        await second.model.load(now: now)

        let snapshot = try loaded(second.model)
        #expect(snapshot.isCached)
        #expect(snapshot.report.month == oct)
        #expect(snapshot.previous?.month == sep)
        #expect(snapshot.updatedAt == snapshot.report.generatedAt)
        // A cached view must not overwrite the widget with older data.
        #expect(second.snapshots.load() == nil)
    }

    @Test func offlineWithNothingCachedFails() async {
        let api = StubAPI()
        api.reportError = .offline
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .failed(let message) = h.model.state else { Issue.record("expected .failed, got \(h.model.state)"); return }
        #expect(message == "You're offline. Your last check-up will show here once it has loaded once.")
    }

    @Test func otherErrorsShowTheirMessage() async {
        let api = StubAPI()
        api.reportError = .message("Something broke")
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .failed(let message) = h.model.state else { Issue.record("expected .failed, got \(h.model.state)"); return }
        #expect(message == "Something broke")
    }

    @Test func selectingSeptemberLoadsItWithAugustBefore() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        await h.model.select(sep)

        let snapshot = try loaded(h.model)
        #expect(h.model.selectedMonth == sep)
        #expect(snapshot.report.month == sep)
        #expect(snapshot.previous?.month == aug)
        #expect(snapshot.parts.first { $0.part == .savingsRate }?.delta == 1)
        // The in-progress month stays available beside any check-up.
        #expect(snapshot.soFar?.month == nov)
        // Looking back does not change what the widget shows.
        #expect(h.snapshots.load()?.month == oct)
    }

    @Test func bandLineNamesTheBandAndTheChange() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        let line = try #require(try loaded(h.model).bandLine)
        #expect(line.band == "Fair")
        #expect(line.rest == ", down 9 since September")
        #expect(line.band + line.rest == "Fair, down 9 since September")
    }

    @Test func bandLineSaysUpSameAndNothingWithoutAPreviousScore() {
        #expect(HealthSnapshot.bandLine(score: 80, previous: 70, month: oct)?.rest == ", up 10 since September")
        #expect(HealthSnapshot.bandLine(score: 70, previous: 70, month: oct)?.rest == ", same as September")
        #expect(HealthSnapshot.bandLine(score: 30, previous: nil, month: oct)?.rest == "")
        #expect(HealthSnapshot.bandLine(score: 30, previous: nil, month: oct)?.band == "Low")
    }

    @Test func partDeltasReadAsSigned() {
        #expect(PartRow.deltaText(-6) == "−6")
        #expect(PartRow.deltaText(4) == "+4")
        #expect(PartRow.deltaText(0) == "±0")
    }

    @Test func updatedDateReadsAsMonthAndDay() {
        let date = Date(timeIntervalSince1970: 1_793_000_000)   // 2026-10-26 UTC
        #expect(HealthView.updatedText(date, calendar: Self.calendar) == "Last updated Oct 26")
    }

    @Test func menuListsFinishedMonthsNewestFirst() async {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        #expect(h.model.checkupChoices == [oct, sep, aug])
    }
}
