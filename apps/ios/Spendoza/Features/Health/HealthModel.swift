import Foundation
import Observation
import SpendozaKit

/// Everything the Health screen shows for one check-up month.
struct HealthSnapshot {
    let report: Report
    /// `history.first`: the report just before the check-up month.
    let previous: Report?
    /// Up to four reports before the check-up month, newest first.
    let history: [Report]
    let parts: [PartChange]
    let suggestion: Suggestion?
    /// The in-progress month, shown "so far".
    let soFar: Report?
    let isCached: Bool
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
@MainActor @Observable
final class HealthModel {
    enum State {
        case loading, empty
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

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let cache: ReportCache
    @ObservationIgnored private let snapshots: SnapshotStore
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private var now = Date()
    @ObservationIgnored private var reports: [Month: Report] = [:]
    @ObservationIgnored private var categories: [BudgetCategory] = []
    /// Months whose report came from the cache because the request failed.
    @ObservationIgnored private var cachedMonths: Set<Month> = []
    /// Months that failed with nothing cached, so we can't say whether they have a report.
    @ObservationIgnored private var unresolved: Set<Month> = []
    @ObservationIgnored private var lastError: Error?

    init(api: any SpendozaAPI, cache: ReportCache, snapshots: SnapshotStore, calendar: Calendar = .current) {
        self.api = api
        self.cache = cache
        self.snapshots = snapshots
        self.calendar = calendar
    }

    /// The finished months a person can pick from the menu, newest first.
    var checkupChoices: [Month] {
        let current = soFarMonth(now: now, calendar: calendar)
        return availableMonths.filter { $0 < current }
    }

    func load(now: Date) async {
        self.now = now
        state = .loading
        reports = [:]
        fetched = []
        cachedMonths = []
        unresolved = []
        lastError = nil
        let current = soFarMonth(now: now, calendar: calendar)

        async let categoryList = (try? await api.categories()) ?? []
        await fetch(Self.window(endingAt: current))
        categories = await categoryList
        availableMonths = reports.keys.sorted(by: >)

        guard let checkup = checkupMonth(now: now, calendar: calendar, reportMonths: Set(reports.keys)) else {
            if let lastError, !unresolved.isEmpty { state = .failed(Self.message(for: lastError)) } else { state = .empty }
            return
        }
        // A newer month we couldn't check might be the real check-up; don't show an older one as if it were.
        if let lastError, unresolved.contains(where: { $0 > checkup && $0 < current }) {
            state = .failed(Self.message(for: lastError))
            return
        }
        selectedMonth = checkup
        build(for: checkup, isInitialLoad: true)
    }

    func select(_ month: Month) async {
        guard !reports.isEmpty else { return }
        // Earlier months this month's own window needs and the first load didn't ask for.
        await fetch(Self.window(endingAt: month).filter { reports[$0] == nil && !fetched.contains($0) })
        selectedMonth = month
        availableMonths = reports.keys.sorted(by: >)
        build(for: month, isInitialLoad: false)
    }

    // MARK: Fetching

    /// Months already asked for in this session, found or not, so `select` doesn't re-ask for gaps.
    @ObservationIgnored private var fetched: Set<Month> = []

    private static func window(endingAt month: Month) -> [Month] {
        var months = [month]
        while months.count < windowSize { months.append(months[months.count - 1].previous) }
        return months
    }

    /// Fetches the months in parallel. A month the server has no report for stays absent; a month that
    /// fails falls back to the cached report, and `cachedMonths` records which ones show older data.
    private func fetch(_ months: [Month]) async {
        let api = self.api
        let results = await withTaskGroup(of: (Month, Result<Report?, Error>).self) { group in
            for month in months {
                group.addTask { (month, await Result { try await api.personalReport(month) }) }
            }
            var all: [(Month, Result<Report?, Error>)] = []
            for await result in group { all.append(result) }
            return all
        }
        for (month, result) in results {
            fetched.insert(month)
            switch result {
            case .success(let report):
                if let report {
                    reports[month] = report
                    cache.store(report)
                }
            case .failure(let error):
                lastError = error
                if let cached = cache.load(month: month) {
                    reports[month] = cached
                    cachedMonths.insert(month)
                } else {
                    unresolved.insert(month)
                }
            }
        }
    }

    private func build(for month: Month, isInitialLoad: Bool) {
        guard let report = reports[month] else { state = .empty; return }
        let current = soFarMonth(now: now, calendar: calendar)
        let previousReports = Array(reports.values
            .filter { $0.month < month }
            .sorted { $0.month > $1.month }
            .prefix(Self.historyLimit))
        let isCached = cachedMonths.contains(month)
        let parts = report.data.health.map {
            partChanges(current: $0, previous: previousReports.first?.data.health)
        } ?? []
        let suggestion = suggestions(current: report, history: previousReports, categories: categories).first
        let soFar = month < current ? reports[current] : nil

        let snapshot = HealthSnapshot(
            report: report, previous: previousReports.first, history: previousReports, parts: parts,
            suggestion: suggestion, soFar: soFar, isCached: isCached,
            updatedAt: isCached ? report.generatedAt : now)
        state = .loaded(snapshot)

        if isInitialLoad, !isCached, let health = report.data.health {
            snapshots.save(WidgetSnapshot(score: health.score, band: ScoreBand(score: health.score),
                                          previousScore: health.previousScore, month: month))
        }
    }

    private static func message(for error: Error) -> String {
        if let api = error as? APIError {
            return api == .offline ? offlineMessage : api.userMessage
        }
        return "Couldn't load your check-up. Try again."
    }
}

private extension Result where Failure == Error {
    init(_ body: () async throws -> Success) async {
        do { self = .success(try await body()) } catch { self = .failure(error) }
    }
}
