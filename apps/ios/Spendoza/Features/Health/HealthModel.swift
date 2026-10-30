import Foundation
import Observation
import SpendozaKit

/// Everything the Health screen shows for one check-up month.
struct HealthSnapshot {
    let report: Report
    /// The report for the calendar month just before the check-up month; nil when that month has none (no deltas then).
    let previous: Report?
    /// Up to four reports before the check-up month, newest first. May have gaps; part trends (Task 10) read it.
    let history: [Report]
    let parts: [PartChange]
    let suggestion: Suggestion?
    /// The in-progress month, shown "so far".
    let soFar: Report?
    let isCached: Bool
    /// When the shown month was fetched (for a cached month, the time it was cached).
    let updatedAt: Date
}

extension HealthSnapshot {
    /// "Fair" and ", down 9 since September" (the band is drawn in its colour, the rest in plain text).
    struct BandLine: Equatable {
        let band: String
        let rest: String
    }

    var bandLine: BandLine? {
        guard let health = report.data.health else { return nil }
        return Self.bandLine(score: health.score, previous: health.previousScore, month: report.month)
    }

    static func bandLine(score: Int, previous: Int?, month: Month) -> BandLine? {
        let band = ScoreBand(score: score).name
        guard let previous else { return BandLine(band: band, rest: "") }
        let delta = score - previous
        let since = month.previous.name
        if delta == 0 { return BandLine(band: band, rest: ", same as \(since)") }
        return BandLine(band: band, rest: ", \(delta < 0 ? "down" : "up") \(abs(delta)) since \(since)")
    }
}

/// Loads the monthly check-up. The API has no list of report months, so it asks for a window of six months
/// (the current month and the five before it) and treats the ones that answer as the available months.
///
/// Every load or selection takes a generation number; whatever finishes after a newer one has started, after the
/// task was cancelled, or after the account signed out is dropped without touching state or caches.
@MainActor @Observable
final class HealthModel {
    enum State {
        case loading
        /// No report in the window. `returning`: the person has statements, so this isn't their first.
        case empty(returning: Bool)
        /// Only the month in progress has a report: no check-up yet, but the month so far.
        case inProgress(Report)
        case loaded(HealthSnapshot)
        case failed(String)
    }

    static let offlineMessage = "You're offline. Your last check-up will show here once it has loaded once."
    /// How many months a window covers: the month itself and the five before it.
    static let windowSize = 6
    private static let historyLimit = 4

    private(set) var state: State = .loading
    private(set) var selectedMonth: Month?
    /// Months that returned a report, newest first. Includes the in-progress month when it has one.
    private(set) var availableMonths: [Month] = []

    /// Called when the server says the session has ended (401): sign out.
    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    /// Called when the server says the account was disabled mid-session: sign out with that text.
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let cache: ReportCache
    @ObservationIgnored private let sync: WidgetSync
    @ObservationIgnored private let scope: AccountScope
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private var now = Date()
    @ObservationIgnored private var reports: [Month: Report] = [:]
    @ObservationIgnored private var categories: [BudgetCategory] = []
    /// Months whose report came from the cache because the request failed.
    @ObservationIgnored private var cachedMonths: Set<Month> = []
    /// When each report was fetched: now for fresh ones, the cache's time for cached ones.
    @ObservationIgnored private var fetchedAt: [Month: Date] = [:]
    /// Months that failed with nothing cached, so we can't say whether they have a report.
    @ObservationIgnored private var unresolved: Set<Month> = []
    /// A failure that wasn't just "offline".
    @ObservationIgnored private var hardError: Error?
    /// Months already asked for in this session, found or not, so `select` doesn't re-ask for gaps.
    @ObservationIgnored private var fetched: Set<Month> = []
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var selectTask: Task<Void, Never>?

    /// `sync` is required (no default) so a test can't reach the real widget centre or standard defaults by accident.
    init(api: any SpendozaAPI, cache: ReportCache, scope: AccountScope, calendar: Calendar = .current,
         sync: WidgetSync) {
        self.api = api
        self.cache = cache
        self.sync = sync
        self.scope = scope
        self.calendar = calendar
    }

    /// The finished months a person can pick from the menu, newest first.
    var checkupChoices: [Month] {
        let current = soFarMonth(now: now, calendar: calendar)
        return availableMonths.filter { $0 < current }
    }

    var isLoaded: Bool {
        if case .loaded = state { return true }
        return false
    }

    // MARK: Loading

    func load(now: Date) async {
        generation += 1
        let mine = generation
        let token = scope.token()
        self.now = now
        if !isLoaded { state = .loading }
        let current = soFarMonth(now: now, calendar: calendar)

        async let categoryList = (try? await api.categories()) ?? []
        var result = await fetch(Self.window(endingAt: current), token: token, now: now)
        // The check-up's own previous month is needed for its deltas; when the check-up is the oldest month of
        // the window, that month wasn't asked for yet.
        if let checkup = checkupMonth(now: now, calendar: calendar, reportMonths: Set(result.reports.keys)),
           !result.asked.contains(checkup.previous), !result.cancelled {
            result.merge(await fetch([checkup.previous], token: token, now: now))
        }
        let cats = await categoryList
        guard isCurrent(mine, token), !result.cancelled else { return }

        reports = result.reports
        cachedMonths = result.cached
        fetchedAt = result.fetchedAt
        unresolved = result.unresolved
        hardError = result.hardError
        fetched = result.asked
        categories = cats
        availableMonths = reports.keys.sorted(by: >)
        if endsSession(hardError) { return }

        guard let checkup = checkupMonth(now: now, calendar: calendar, reportMonths: Set(reports.keys)) else {
            if !unresolved.isEmpty {
                state = .failed(Self.message(for: hardError))
            } else if let soFar = reports[current] {
                state = .inProgress(soFar)
            } else {
                let returning = await hasStatements()
                guard isCurrent(mine, token) else { return }
                state = .empty(returning: returning)
            }
            return
        }
        // A newer month that failed for a real reason might be the true check-up; don't show an older one as if it
        // were. If every failure was just "offline", the cache is the best we have, and it says so.
        if hardError != nil, unresolved.contains(where: { $0 > checkup && $0 < current }) {
            state = .failed(Self.message(for: hardError))
            return
        }
        selectedMonth = checkup
        build(for: checkup, saveWidget: true, token: token)
    }

    func select(_ month: Month) async {
        guard !reports.isEmpty else { return }
        generation += 1
        let mine = generation
        let token = scope.token()
        // Earlier months this month's own window needs and the first load didn't ask for.
        let missing = Self.window(endingAt: month).filter { reports[$0] == nil && !fetched.contains($0) }
        let result = await fetch(missing, token: token, now: now)
        guard isCurrent(mine, token), !result.cancelled else { return }
        if endsSession(result.hardError) { return }

        reports.merge(result.reports) { _, new in new }
        cachedMonths.formUnion(result.cached)
        fetchedAt.merge(result.fetchedAt) { _, new in new }
        unresolved.formUnion(result.unresolved)
        hardError = hardError ?? result.hardError
        fetched.formUnion(result.asked)
        selectedMonth = month
        availableMonths = reports.keys.sorted(by: >)
        build(for: month, saveWidget: false, token: token)
    }

    /// For the month menu: starts a selection, cancelling any selection still running.
    func requestSelect(_ month: Month) {
        selectTask?.cancel()
        selectTask = Task { await select(month) }
    }

    /// Waits for the selection started by `requestSelect`.
    func settle() async { await selectTask?.value }

    private func isCurrent(_ mine: Int, _ token: AccountScope.Token) -> Bool {
        mine == generation && !Task.isCancelled && scope.isCurrent(token)
    }

    // MARK: Fetching

    private struct Fetched {
        var reports: [Month: Report] = [:]
        var cached: Set<Month> = []
        var fetchedAt: [Month: Date] = [:]
        var unresolved: Set<Month> = []
        var asked: Set<Month> = []
        var hardError: Error?
        var cancelled = false

        mutating func merge(_ other: Fetched) {
            reports.merge(other.reports) { _, new in new }
            cached.formUnion(other.cached)
            fetchedAt.merge(other.fetchedAt) { _, new in new }
            unresolved.formUnion(other.unresolved)
            asked.formUnion(other.asked)
            hardError = hardError ?? other.hardError
            cancelled = cancelled || other.cancelled
        }
    }

    /// A 401 means the session is over, and a disabled account is signed out with its notice: hand it to the sign-out and show nothing more.
    private func endsSession(_ error: Error?) -> Bool {
        switch error as? APIError {
        case .unauthorized:
            onSessionEnded?()
            return true
        case .accountDisabled(let text):
            onAccountDisabled?(text)
            return true
        default:
            return false
        }
    }

    /// Whether the person has uploaded statements before (so an empty window doesn't mean they're new).
    private func hasStatements() async -> Bool {
        ((try? await api.statements()) ?? []).isEmpty == false
    }

    private static func window(endingAt month: Month) -> [Month] {
        var months = [month]
        while months.count < windowSize { months.append(months[months.count - 1].previous) }
        return months
    }

    /// Fetches the months in parallel. A month the server has no report for (or only an empty one, R42) stays
    /// absent and leaves the cache; a month that fails falls back to its cached report. Cancellation is reported as
    /// such, never as a failure.
    private func fetch(_ months: [Month], token: AccountScope.Token, now: Date) async -> Fetched {
        let api = self.api
        let results = await withTaskGroup(of: (Month, Result<Report?, Error>).self) { group in
            for month in months {
                group.addTask { (month, await Result { try await api.personalReport(month) }) }
            }
            var all: [(Month, Result<Report?, Error>)] = []
            for await result in group { all.append(result) }
            return all
        }
        var out = Fetched()
        for (month, result) in results {
            out.asked.insert(month)
            switch result {
            case .success(let report):
                if let report, !report.data.hasNoData {
                    out.reports[month] = report
                    out.fetchedAt[month] = now
                    cache.store(report, fetchedAt: now, token: token)
                } else {
                    cache.remove(month: month, token: token)
                }
            case .failure(let error):
                // URLError.cancelled is only a cancellation when this load was cancelled; otherwise it failed.
                if error is CancellationError || ((error as? URLError)?.code == .cancelled && Task.isCancelled) {
                    out.cancelled = true
                    continue
                }
                if (error as? APIError) != .offline { out.hardError = out.hardError ?? error }
                if let entry = cache.entry(month: month), !entry.report.data.hasNoData {
                    out.reports[month] = entry.report
                    out.cached.insert(month)
                    out.fetchedAt[month] = entry.fetchedAt
                } else {
                    out.unresolved.insert(month)
                }
            }
        }
        if Task.isCancelled { out.cancelled = true }
        return out
    }

    // MARK: Building

    private func build(for month: Month, saveWidget: Bool, token: AccountScope.Token) {
        guard let report = reports[month] else { state = .empty(returning: true); return }
        let current = soFarMonth(now: now, calendar: calendar)
        let history = Array(reports.values
            .filter { $0.month < month }
            .sorted { $0.month > $1.month }
            .prefix(Self.historyLimit))
        // Deltas compare with the calendar month just before, the same month the server's previous_score uses.
        let previous = reports[month.previous]
        let parts = report.data.health.map {
            partChanges(current: $0, previous: previous?.data.health)
        } ?? []
        let suggestion = suggestions(current: report, previous: previous, history: history, categories: categories).first
        let soFar = month < current ? reports[current] : nil
        // Older data when this month came from the cache, or a newer finished month couldn't be checked.
        let isCached = cachedMonths.contains(month)
            || unresolved.contains { $0 > month && $0 < current }

        state = .loaded(HealthSnapshot(
            report: report, previous: previous, history: history, parts: parts,
            suggestion: suggestion, soFar: soFar, isCached: isCached,
            updatedAt: fetchedAt[month] ?? now))

        if saveWidget, !isCached, let health = report.data.health {
            sync.save(WidgetSnapshot(score: health.score, band: ScoreBand(score: health.score),
                                     previousScore: health.previousScore, month: month),
                      token: token, scope: scope)
            sync.markSeen(month, token: token, scope: scope)
        }
    }

    private static func message(for error: Error?) -> String {
        guard let error else { return offlineMessage }
        if let api = error as? APIError { return api == .offline ? offlineMessage : api.userMessage }
        return "Couldn't load your check-up. Try again."
    }
}

private extension Result where Failure == Error {
    init(_ body: () async throws -> Success) async {
        do { self = .success(try await body()) } catch { self = .failure(error) }
    }
}
