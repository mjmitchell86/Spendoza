#if DEBUG
import Foundation
import SpendozaKit

/// A scriptable `SpendozaAPI`. Records every call, in order, in `calls`.
final class StubAPI: SpendozaAPI, @unchecked Sendable {
    private let lock = NSLock()
    private var _calls: [String] = []
    private var _requestedMonths: [Month] = []

    var reports: [Month: Report] = [:]
    var reportError: APIError?
    /// Per-month failures (any error, e.g. `URLError(.cancelled)`).
    var failingMonths: [Month: Error] = [:]
    /// Months that answer slowly (a cancellable sleep).
    var reportDelay: @Sendable (Month) -> Duration? = { _ in nil }
    var categoryList: [BudgetCategory] = StubAPI.defaultCategories
    var categoriesError: APIError?
    /// `categories()` waits (up to a second) for `transactions(from:to:)` to start, and records whether it did.
    var categoriesWaitForTransactions = false
    private var _categoriesSawTransactions = false
    var categoriesSawTransactions: Bool { lock.withLock { _categoriesSawTransactions } }
    var transactionList: [Transaction] = []
    var transactionsError: APIError?
    var setCategoryError: APIError?
    var budgetError: APIError?
    var statementTransactions: [String: [Transaction]] = [:]

    var uploadResults: [Result<Statement, APIError>] = []
    /// Each `statements()` call returns the next script entry; the last entry repeats.
    var statementScript: [[Statement]] = []
    /// The next this-many `statements()` calls throw `.offline`.
    var statementFailures = 0
    var updateProfileError: APIError?
    var reprocessError: APIError?
    private var pollIndex = 0

    var calls: [String] { lock.withLock { _calls } }
    var requestedMonths: [Month] { lock.withLock { _requestedMonths } }

    private func record(_ call: String) { lock.withLock { _calls.append(call) } }

    static let defaultCategories: [BudgetCategory] = [
        .init(id: "c1", name: "Housing", budgetClass: .need),
        .init(id: "c2", name: "Groceries", budgetClass: .need),
        .init(id: "c3", name: "Dining out", budgetClass: .want),
        .init(id: "c4", name: "Streaming", budgetClass: .want),
    ]

    // MARK: SpendozaAPI

    /// What `profile()` answers; nil throws `.offline`.
    var profileResult: Profile?

    func profile() async throws -> Profile {
        guard let profileResult else { throw APIError.offline }
        return profileResult
    }

    func completeOnboarding() async throws { record("completeOnboarding") }

    func updateProfile(_ change: ProfileChange) async throws -> Profile {
        record("updateProfile(email: \(change.emailReportsEnabled.map(String.init) ?? "nil"), tz: \(change.timezone ?? "nil"))")
        if let updateProfileError { throw updateProfileError }
        return Profile(id: "u", displayName: "T", onboardingCompleted: false, isAdmin: false,
                       emailReportsEnabled: change.emailReportsEnabled ?? false, householdID: nil)
    }

    func personalReport(_ month: Month) async throws -> Report? {
        lock.withLock { _requestedMonths.append(month) }
        if let delay = reportDelay(month) { try await Task.sleep(for: delay) }
        if let failure = failingMonths[month] { throw failure }
        if let reportError { throw reportError }
        return reports[month]
    }

    func categories() async throws -> [BudgetCategory] {
        if categoriesWaitForTransactions {
            let deadline = ContinuousClock.now + .seconds(1)
            while !calls.contains("transactions"), ContinuousClock.now < deadline {
                try? await Task.sleep(for: .milliseconds(10))
            }
            let saw = calls.contains("transactions")
            lock.withLock { _categoriesSawTransactions = saw }
        }
        if let categoriesError { throw categoriesError }
        if let reportError { throw reportError }
        return categoryList
    }

    func transactions(from: Date, to: Date) async throws -> [Transaction] {
        record("transactions")
        if let transactionsError { throw transactionsError }
        return transactionList
    }

    func transactions(statementID: String) async throws -> [Transaction] {
        record("transactions(\(statementID))")
        if let transactionsError { throw transactionsError }
        return statementTransactions[statementID] ?? []
    }

    func setCategory(transactionID: String, category: String?) async throws {
        record("setCategory(\(transactionID), \(category ?? "nil"))")
        if let setCategoryError { throw setCategoryError }
    }

    func createBudgetGoal(name: String, categoryID: String, amount: Int) async throws {
        record("budget(\(name), \(categoryID), \(amount))")
        if let budgetError { throw budgetError }
    }

    func uploadStatement(fileURL: URL, mimeType: String, bankName: String?) async throws -> Statement {
        record("upload(\(fileURL.lastPathComponent), \(mimeType))" + (bankName.map { " bank=\($0)" } ?? ""))
        let result: Result<Statement, APIError> = lock.withLock {
            uploadResults.isEmpty
                ? .success(StubAPI.statement(id: "s-\(_calls.count)", status: .uploaded))
                : uploadResults.removeFirst()
        }
        return try result.get()
    }

    func statements() async throws -> [Statement] {
        record("statements")
        let fail: Bool = lock.withLock {
            guard statementFailures > 0 else { return false }
            statementFailures -= 1
            return true
        }
        if fail { throw APIError.offline }
        return lock.withLock {
            guard !statementScript.isEmpty else { return [] }
            let entry = statementScript[min(pollIndex, statementScript.count - 1)]
            pollIndex += 1
            return entry
        }
    }

    func reprocessStatement(id: String) async throws {
        record("reprocess(\(id))")
        if let reprocessError { throw reprocessError }
    }

    func removeStatement(id: String) async throws { record("remove(\(id))") }
    func signUp(email: String, password: String, displayName: String, inviteCode: String) async throws {}
    func joinWaitlist(name: String, email: String) async throws {}

    // MARK: Builders

    static func statement(id: String, status: StatementStatus, fileType: String = "pdf",
                          isParentSplit: Bool = false, childCount: Int? = nil) -> Statement {
        Statement(id: id, status: status, fileType: fileType, createdAt: Date(timeIntervalSince1970: 1_790_000_000),
                  isParentSplit: isParentSplit, childCount: childCount)
    }

    /// A report in the server's wire format. `points` are savings, needs, wants, emergency fund, debt.
    static func report(_ month: Month, score: Int, previous: Int?, points: [Int],
                       categories: [(String, Double)] = [("Housing", 1800), ("Dining out", 300)]) -> Report {
        let keys = ["savings_rate", "needs_ratio", "wants_ratio", "emergency_fund", "debt_to_income"]
        let maxes = [25, 20, 15, 20, 20]
        let values = [16.0, 48.0, 34.0, 1.5, 0.45]
        let factors = zip(zip(keys, maxes), zip(points, values)).map { pair, pv in
            "\"\(pair.0)\": { \"value\": \(pv.1), \"points\": \(pv.0), \"max\": \(pair.1), \"rating\": \"ok\" }"
        }.joined(separator: ",")
        let rows = categories.map { "{ \"category\": \"\($0.0)\", \"amount\": \($0.1), \"percentage\": 10 }" }.joined(separator: ",")
        let json = """
        { "id": "r", "report_month": "\(month.apiString)",
          "report_data": { "total_income": 5000, "total_expenses": 4000, "savings_rate": 16.0,
            "by_category": [\(rows)],
            "financial_health_score": { "score": \(score), "previous_score": \(previous.map(String.init) ?? "null"),
              "factors": { \(factors) } } },
          "ai_insights": null, "generated_at": "2026-11-01T09:30:00.000Z", "has_new_data": false }
        """
        // The JSON is built here, so a decode failure is a bug in the stub.
        return try! JSONDecoder().decode(Report.self, from: Data(json.utf8))
    }

    /// What the server generated for a month with no transactions: zeros, no categories, a score of 55.
    static func emptyReport(_ month: Month) -> Report {
        let json = """
        { "id": "r", "report_month": "\(month.apiString)",
          "report_data": { "total_income": 0, "total_expenses": 0, "savings_rate": 0, "by_category": [],
            "financial_health_score": { "score": 55, "previous_score": null, "factors": {} } },
          "ai_insights": null, "generated_at": "2026-11-01T09:30:00.000Z", "has_new_data": false }
        """
        return try! JSONDecoder().decode(Report.self, from: Data(json.utf8))
    }

    static let sep = Month(year: 2026, month: 9)
    static let oct = Month(year: 2026, month: 10)
    static let nov = Month(year: 2026, month: 11)
    static let aug = Month(year: 2026, month: 8)

    /// August 70, September 73, October 64 (wants 15 → 9), November 58 so far.
    static func standardReports() -> [Month: Report] {
        [
            aug: report(aug, score: 70, previous: nil, points: [22, 20, 15, 8, 5]),
            sep: report(sep, score: 73, previous: 70, points: [23, 20, 15, 10, 5]),
            oct: report(oct, score: 64, previous: 73, points: [20, 20, 9, 10, 5]),
            nov: report(nov, score: 58, previous: 64, points: [18, 20, 10, 10, 0]),
        ]
    }
}
#endif
