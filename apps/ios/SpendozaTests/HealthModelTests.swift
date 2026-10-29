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
        let scope: AccountScope
        let cleanup: () -> Void
    }

    private func harness(_ api: StubAPI, cache existing: ReportCache? = nil, scope existingScope: AccountScope? = nil) -> Harness {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("health-\(UUID().uuidString)")
        let suite = "test.spendoza.\(UUID().uuidString)"
        let scope = existingScope ?? AccountScope(userID: "user-a")
        let cache = existing ?? ReportCache(directory: dir, scope: scope)
        let snapshots = SnapshotStore(appGroup: suite)
        // A sync of its own (11.59): never the real widget centre or the standard defaults.
        let sync = WidgetSync(snapshots: snapshots, widgets: UITestStub.QuietWidgets(),
                              defaults: UserDefaults(suiteName: suite)!)
        let model = HealthModel(api: api, cache: cache, scope: scope, calendar: Self.calendar, sync: sync)
        return Harness(model: model, cache: cache, snapshots: snapshots, scope: scope, cleanup: {
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

    /// R42: before the first month ends there's no check-up, but the month so far is shown.
    @Test func onlyTheInProgressMonthShowsItSoFar() async {
        let api = StubAPI()
        api.reports = [nov: StubAPI.standardReports()[nov]!]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .inProgress(let report) = h.model.state else {
            Issue.record("expected .inProgress, got \(h.model.state)"); return
        }
        #expect(report.month == nov)
        #expect(HealthView.firstCheckupText(soFar: nov) == "Your first check-up arrives when November ends.")
    }

    /// R42: an all-zero report (no income, spending or categories) is no report.
    @Test func emptyReportsCountAsNoReport() async {
        let api = StubAPI()
        api.reports = [oct: StubAPI.emptyReport(oct), sep: StubAPI.emptyReport(sep)]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .empty(let returning) = h.model.state else {
            Issue.record("expected .empty, got \(h.model.state)"); return
        }
        #expect(!returning)
        #expect(h.model.availableMonths.isEmpty)
        #expect(h.cache.load(month: oct) == nil)
        #expect(h.snapshots.load() == nil)
    }

    @Test func anEmptyFinishedMonthBesideARealSoFarMonthShowsSoFar() async {
        let api = StubAPI()
        api.reports = [oct: StubAPI.emptyReport(oct), nov: StubAPI.standardReports()[nov]!]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .inProgress = h.model.state else { Issue.record("expected .inProgress, got \(h.model.state)"); return }
    }

    /// 9.42: someone with statements but no report in the last six months isn't asked for their "first" statement.
    @Test func aReturningPersonWithNothingRecentIsNotNew() async {
        let api = StubAPI()
        api.statementScript = [[StubAPI.statement(id: "s1", status: .parsed)]]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .empty(let returning) = h.model.state else { Issue.record("expected .empty, got \(h.model.state)"); return }
        #expect(returning)
        #expect(HealthView.emptyText(returning: true).button == "Add a statement")
        #expect(HealthView.emptyText(returning: false).button == "Add your first statement")
    }

    /// Minor 2: when the check-up is the oldest month of the window, the month before it is fetched too.
    @Test func aCheckupAtTheWindowsEdgeStillGetsDeltas() async throws {
        let jun = Month(year: 2026, month: 6), may = Month(year: 2026, month: 5)
        let api = StubAPI()
        api.reports = [
            jun: StubAPI.report(jun, score: 64, previous: 70, points: [20, 20, 9, 10, 5]),
            may: StubAPI.report(may, score: 70, previous: nil, points: [22, 20, 15, 8, 5]),
        ]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        let snapshot = try loaded(h.model)
        #expect(snapshot.report.month == jun)
        #expect(snapshot.previous?.month == may)
        #expect(snapshot.parts.first { $0.part == .wants }?.delta == -6)
        #expect(api.requestedMonths.contains(may))
    }

    /// 9.39: a month the server no longer has is dropped from the cache.
    @Test func aMonthThatIsGoneIsEvictedFromTheCache() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        #expect(h.cache.load(month: oct) != nil)

        api.reports[oct] = nil
        await h.model.load(now: now)
        #expect(h.cache.load(month: oct) == nil)
        #expect(try loaded(h.model).report.month == sep)
    }

    /// 9.40: the server saying the session has ended signs the person out.
    @Test func anUnauthorizedAnswerEndsTheSession() async {
        let api = StubAPI()
        api.reportError = .unauthorized
        let h = harness(api)
        defer { h.cleanup() }
        var ended = 0
        h.model.onSessionEnded = { ended += 1 }
        await h.model.load(now: now)
        #expect(ended == 1)
    }

    /// 9.43: one month failing for real doesn't hide an older check-up that loaded.
    @Test func aFailureOlderThanTheCheckupStillShowsIt() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        api.failingMonths = [aug: APIError.message("Server down")]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        let snapshot = try loaded(h.model)
        #expect(snapshot.report.month == oct)
        #expect(!snapshot.isCached)
        #expect(snapshot.previous?.month == sep)
    }

    @Test func offlineAfterACachedOctoberShowsTheCachedCheckup() async throws {
        let online = StubAPI()
        online.reports = StubAPI.standardReports()
        let first = harness(online)
        defer { first.cleanup() }
        await first.model.load(now: now)

        let offline = StubAPI()
        offline.reportError = .offline
        let second = harness(offline, cache: first.cache, scope: first.scope)
        defer { second.cleanup() }
        await second.model.load(now: now.addingTimeInterval(2 * 86_400))

        let snapshot = try loaded(second.model)
        #expect(snapshot.isCached)
        #expect(snapshot.report.month == oct)
        #expect(snapshot.previous?.month == sep)
        // 9.38: "Last updated" is when the app last fetched October, not when the server generated it.
        #expect(snapshot.updatedAt == now)
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

    // MARK: Cancellation (B)

    private func isLoading(_ model: HealthModel) -> Bool {
        if case .loading = model.state { return true }
        return false
    }

    @Test func aCancelledLoadLeavesTheStateAloneAndAReloadWorks() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        api.reportDelay = { _ in .milliseconds(400) }
        let h = harness(api)
        defer { h.cleanup() }
        let task = Task { await h.model.load(now: now) }
        try await Task.sleep(for: .milliseconds(50))
        task.cancel()
        await task.value
        #expect(isLoading(h.model))
        #expect(h.cache.load(month: oct) == nil)
        #expect(h.snapshots.load() == nil)

        api.reportDelay = { _ in nil }
        await h.model.load(now: now)
        #expect(try loaded(h.model).report.month == oct)
    }

    /// 9.44: URLError.cancelled is a cancellation only when the load itself was cancelled; otherwise it's a failure
    /// (the screen mustn't sit on the spinner).
    @Test func aURLSessionCancellationOutsideACancelledLoadIsAFailure() async {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        api.failingMonths = [oct: URLError(.cancelled)]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        guard case .failed = h.model.state else { Issue.record("expected .failed, got \(h.model.state)"); return }
    }

    @Test func aURLSessionCancellationInACancelledLoadLeavesTheStateAlone() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        api.reportDelay = { _ in .milliseconds(300) }
        api.failingMonths = [oct: URLError(.cancelled)]
        let h = harness(api)
        defer { h.cleanup() }
        let task = Task { await h.model.load(now: now) }
        try await Task.sleep(for: .milliseconds(50))
        task.cancel()
        await task.value
        #expect(isLoading(h.model))
    }

    // MARK: Stale selection (C)

    @Test func anOlderSelectFinishingLateDoesNotOverwriteANewerOne() async throws {
        let apr = Month(year: 2026, month: 4)
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        api.reportDelay = { $0 == apr ? .milliseconds(300) : nil }
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)

        let slow = Task { await h.model.select(sep) }
        try await Task.sleep(for: .milliseconds(50))
        await h.model.select(oct)
        await slow.value
        #expect(h.model.selectedMonth == oct)
        #expect(try loaded(h.model).report.month == oct)
    }

    @Test func requestSelectCancelsThePreviousRequest() async throws {
        let apr = Month(year: 2026, month: 4)
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        api.reportDelay = { $0 == apr ? .milliseconds(300) : nil }
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        h.model.requestSelect(sep)
        try await Task.sleep(for: .milliseconds(50))
        h.model.requestSelect(oct)
        await h.model.settle()
        #expect(h.model.selectedMonth == oct)
        #expect(try loaded(h.model).report.month == oct)
    }

    // MARK: Gaps (D)

    @Test func deltasCompareOnlyWithTheCalendarMonthBefore() async throws {
        let api = StubAPI()
        var reports = StubAPI.standardReports()
        reports[sep] = nil   // August and October exist, September doesn't
        api.reports = reports
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        let snapshot = try loaded(h.model)
        #expect(snapshot.report.month == oct)
        #expect(snapshot.previous == nil)
        #expect(snapshot.parts.allSatisfy { $0.delta == nil })
        #expect(snapshot.history.map(\.month) == [aug])   // kept, with the gap, for trends
    }

    @Test func theFirstEverMonthHasNoDeltas() async throws {
        let api = StubAPI()
        let all = StubAPI.standardReports()
        api.reports = [oct: all[oct]!, nov: all[nov]!]
        let h = harness(api)
        defer { h.cleanup() }
        await h.model.load(now: now)
        let snapshot = try loaded(h.model)
        #expect(snapshot.parts.allSatisfy { $0.delta == nil })
        #expect(snapshot.history.isEmpty)
    }

    // MARK: Sign-out (F)

    @Test func signingOutDuringALoadDropsItsWrites() async throws {
        let api = StubAPI()
        api.reports = StubAPI.standardReports()
        api.reportDelay = { _ in .milliseconds(200) }
        let h = harness(api)
        defer { h.cleanup() }
        let task = Task { await h.model.load(now: now) }
        try await Task.sleep(for: .milliseconds(50))
        h.scope.end()
        await task.value
        h.scope.begin(userID: "user-a")   // the same person signs back in
        #expect(h.cache.load(month: oct) == nil)
        #expect(h.snapshots.load() == nil)
        #expect(!isLoaded(h.model))
    }

    private func isLoaded(_ model: HealthModel) -> Bool {
        if case .loaded = model.state { return true }
        return false
    }

    // MARK: Month boundary offline (G)

    @Test func offlineAfterTheMonthTurnedStillShowsTheNewestCachedCheckup() async throws {
        let oct20 = Date(timeIntervalSince1970: 1_792_454_400)   // 2026-10-20
        let online = StubAPI()
        let all = StubAPI.standardReports()
        online.reports = [aug: all[aug]!, sep: all[sep]!, oct: all[oct]!]
        let first = harness(online)
        defer { first.cleanup() }
        await first.model.load(now: oct20)

        let offline = StubAPI()
        offline.reportError = .offline
        let second = harness(offline, cache: first.cache, scope: first.scope)
        defer { second.cleanup() }
        let dec3 = Date(timeIntervalSince1970: 1_796_256_000)   // 2026-12-03: November has no cache
        await second.model.load(now: dec3)
        let snapshot = try loaded(second.model)
        #expect(snapshot.isCached)
        #expect(snapshot.report.month == oct)
    }

    @Test func aRealServerErrorForANewerMonthStillFails() async throws {
        let oct20 = Date(timeIntervalSince1970: 1_792_454_400)
        let online = StubAPI()
        let all = StubAPI.standardReports()
        online.reports = [sep: all[sep]!, oct: all[oct]!]
        let first = harness(online)
        defer { first.cleanup() }
        await first.model.load(now: oct20)

        let flaky = StubAPI()
        flaky.reports = [sep: all[sep]!, oct: all[oct]!]
        flaky.failingMonths = [nov: APIError.message("Server down")]
        let second = harness(flaky, cache: first.cache, scope: first.scope)
        defer { second.cleanup() }
        await second.model.load(now: Date(timeIntervalSince1970: 1_796_256_000))
        guard case .failed(let message) = second.model.state else { Issue.record("expected .failed, got \(second.model.state)"); return }
        #expect(message == "Server down")
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
