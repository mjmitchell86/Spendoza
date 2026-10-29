import Foundation
import SpendozaKit
@testable import Spendoza

/// October check-up with Jun to Sep behind it, the numbers on the drill-down mockup:
/// Wants 9/15 (was 15), Dining out $448 (was $138), typical month $140.
enum DrillFixture {
    static let jun = Month(year: 2026, month: 6), jul = Month(year: 2026, month: 7)
    static let aug = StubAPI.aug, sep = StubAPI.sep, oct = StubAPI.oct

    static let categories: [BudgetCategory] = [
        .init(id: "c1", name: "Housing", budgetClass: .need),
        .init(id: "c2", name: "Groceries", budgetClass: .need),
        .init(id: "c3", name: "Dining out", budgetClass: .want),
        .init(id: "c4", name: "Entertainment", budgetClass: .want),
        .init(id: "c5", name: "Personal", budgetClass: .want),
    ]

    private static let rows: [Month: [(String, Double)]] = [
        jun: [("Housing", 1800), ("Dining out", 140), ("Entertainment", 50), ("Personal", 140)],
        jul: [("Housing", 1800), ("Dining out", 140), ("Entertainment", 50), ("Personal", 140)],
        aug: [("Housing", 1800), ("Dining out", 142), ("Entertainment", 50), ("Personal", 140)],
        sep: [("Housing", 1800), ("Dining out", 138), ("Entertainment", 55), ("Personal", 149)],
        oct: [("Housing", 1800), ("Dining out", 448), ("Entertainment", 96), ("Personal", 127)],
    ]
    private static let wantsPoints: [Month: Int] = [jun: 15, jul: 15, aug: 14, sep: 15, oct: 9]

    static func report(_ month: Month) -> Report {
        StubAPI.report(month, score: 64, previous: 73, points: [20, 20, wantsPoints[month] ?? 15, 10, 5],
                       categories: rows[month] ?? [])
    }

    /// The October check-up snapshot; `dropping` removes months that have no report.
    static func snapshot(dropping: Set<Month> = []) -> HealthSnapshot {
        let present = [sep, aug, jul, jun].filter { !dropping.contains($0) }.map(report)
        let previous = dropping.contains(sep) ? nil : report(sep)
        let current = report(oct)
        let parts = current.data.health.map { partChanges(current: $0, previous: previous?.data.health) } ?? []
        return HealthSnapshot(report: current, previous: previous, history: present, parts: parts,
                              suggestion: nil, soFar: nil, isCached: false, updatedAt: .now)
    }

    static func api() -> StubAPI {
        let api = StubAPI()
        api.categoryList = categories
        return api
    }

    static func tx(_ id: String, _ date: String, _ amount: Double, _ category: String?,
                   type: TransactionType = .debit) -> Transaction {
        Transaction(id: id, date: date, description: "Place \(id)", amount: amount, type: type, category: category)
    }
}
