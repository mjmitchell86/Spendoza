import Foundation
import Observation
import SpendozaKit

/// The Overview segment for one month: money in against money out, spending by category, upcoming bills and
/// this month's statements. The report is the server's (`/reports/personal`); a month without data has none.
@MainActor @Observable
final class OverviewModel {
    struct Totals: Equatable {
        let income: Double
        let expenses: Double
        let net: Double
        /// "21.1%" (the server's rate is already a percentage).
        let savingsRateText: String
        /// "You spent 12% more than you earned" when the rate is negative.
        let overspendNote: String?
    }

    struct CategoryRow: Equatable, Identifiable {
        let name: String
        let amount: Double
        /// Of all the categories' spending, in whole percents.
        let sharePercent: Int
        /// Bar length against the biggest category, 0...1.
        let barFraction: Double
        var id: String { name }
    }

    struct UpcomingRow: Equatable, Identifiable {
        let id: String
        let name: String
        let amount: Double
        /// "Nov 2 (in 3d)" or "Oct 30 (today)".
        let whenText: String
        /// Due in three days or fewer (amber).
        let isSoon: Bool
        let isAuto: Bool
    }

    let month: Month
    private(set) var report: Report?
    /// Recurring bills due today or later, soonest first.
    private(set) var upcoming: [Expense] = []
    /// This month's statements, by `statementMonth`, from the shared poller (so they follow it while one processes).
    var statements: [Statement] { poller.statements.filter { $0.statementMonth == month } }
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    private(set) var refreshing = false
    private(set) var exportError: String?

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI
    let poller: StatementPoller
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let calendar: Calendar

    init(api: any SpendozaAPI, month: Month, poller: StatementPoller, now: @escaping () -> Date = { AppClock.now },
         calendar: Calendar = .current) {
        self.api = api
        self.month = month
        self.poller = poller
        self.now = now
        self.calendar = calendar
    }

    // MARK: What the screen shows

    var isEmpty: Bool { hasLoaded && loadError == nil && report == nil }

    var emptyText: String { "No transactions for \(month.name)" }

    /// The empty month offers "Add statement".
    var offersAddStatement: Bool { isEmpty }

    var totals: Totals? {
        guard let data = report?.data else { return nil }
        return Totals(income: data.totalIncome, expenses: data.totalExpenses, net: data.totalIncome - data.totalExpenses,
                      savingsRateText: String(format: "%.1f%%", data.savingsRate),
                      overspendNote: Self.overspendNote(data.savingsRate))
    }

    var categoryRows: [CategoryRow] {
        guard let rows = report?.data.byCategory else { return [] }
        let sorted = rows.sorted { $0.amount > $1.amount }
        let total = sorted.reduce(0) { $0 + $1.amount }
        let biggest = sorted.first?.amount ?? 0
        return sorted.map {
            CategoryRow(name: $0.category, amount: $0.amount,
                        sharePercent: total > 0 ? Int(($0.amount / total * 100).rounded()) : 0,
                        barFraction: biggest > 0 ? $0.amount / biggest : 0)
        }
    }

    var upcomingRows: [UpcomingRow] {
        let today = calendar.startOfDay(for: now())
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "MMM d"
        return upcoming.map { bill in
            let days = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: bill.nextDueDate)).day ?? 0
            let when = days == 0 ? "(today)" : "(in \(days)d)"
            let friendly = bill.friendlyName?.trimmingCharacters(in: .whitespacesAndNewlines)
            return UpcomingRow(id: bill.id, name: friendly.flatMap { $0.isEmpty ? nil : $0 } ?? bill.description,
                               amount: bill.amount, whenText: "\(formatter.string(from: bill.nextDueDate)) \(when)",
                               isSoon: days <= 3, isAuto: bill.autoDetected)
        }
    }

    /// "You spent 12% more than you earned"; nil when nothing was overspent.
    static func overspendNote(_ ratePercent: Double) -> String? {
        guard ratePercent < 0 else { return nil }
        let rounded = (-ratePercent * 10).rounded() / 10
        let text = rounded == rounded.rounded() ? String(Int(rounded)) : String(format: "%.1f", rounded)
        return "You spent \(text)% more than you earned"
    }

    // MARK: Loading

    func load() async {
        let today = calendar.startOfDay(for: now())
        let api = self.api, month = self.month
        async let reportResult = Self.capture { try await api.personalReport(month) }
        async let billsResult = Self.capture { try await api.upcomingBills(from: today) }
        async let statementsLoaded: Void = poller.refresh()
        let (fetchedReport, bills, _) = await (reportResult, billsResult, statementsLoaded)
        if Task.isCancelled { return }

        // The bills and statements are extras: when they fail the report still shows.
        upcoming = ((try? bills.get()) ?? [])
            .filter { $0.nextDueDate >= today }
            .sorted { $0.nextDueDate < $1.nextDueDate }
        switch fetchedReport {
        case .success(let fetched):
            report = fetched.flatMap { $0.data.hasNoData ? nil : $0 }
            loadError = nil
        case .failure(let error):
            if endsSession(error) { return }
            loadError = (error as? APIError)?.userMessage ?? "Couldn't load this month. Try again."
        }
        hasLoaded = true
    }

    /// Rebuilds this month's report on the server (2 per 24 hours), then reloads. Returns the server's words when
    /// it refuses; nil when it worked.
    func refresh() async -> String? {
        refreshing = true
        defer { refreshing = false }
        do {
            try await api.generateReport(month)
        } catch {
            if endsSession(error) { return nil }
            return (error as? APIError)?.userMessage ?? "Couldn't refresh the report. Try again."
        }
        await load()
        return nil
    }

    /// Downloads the month's PDF to a file the preview can open; nil (with `exportError`) when it fails.
    func exportPDF() async -> URL? {
        let exporter = PDFReportsModel(api: api, now: now(), calendar: calendar)
        let url = await exporter.export(PDFOption(title: month.name, period: .month(month)))
        exportError = exporter.error
        return url
    }

    private func endsSession(_ error: Error) -> Bool {
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

    private static func capture<T: Sendable>(_ body: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await body()) } catch { return .failure(error) }
    }
}
