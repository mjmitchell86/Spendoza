import Foundation
import Testing
@testable import SpendozaKit

/// A report in the wire format with the given totals and category rows.
private func report(_ apiMonth: String, income: Double, expenses: Double, rows: [(String, Double)]) throws -> Report {
    let list = rows.map { #"{"category":"\#($0.0)","amount":\#($0.1),"percentage":0}"# }.joined(separator: ",")
    let json = """
    {"report_month":"\(apiMonth)","ai_insights":null,"generated_at":"2026-11-01T09:00:00Z",
     "report_data":{"total_income":\(income),"total_expenses":\(expenses),"savings_rate":0,
      "by_category":[\(list)]}}
    """
    return try JSONDecoder().decode(Report.self, from: Data(json.utf8))
}

/// R42: a report with nothing in it is no report.
struct EmptyReportTests {
    @Test func noIncomeSpendingOrCategoriesIsEmpty() throws {
        #expect(try report("2026-10-01", income: 0, expenses: 0, rows: []).data.hasNoData)
    }

    @Test func anyIncomeSpendingOrCategoryRowIsData() throws {
        #expect(!(try report("2026-10-01", income: 10, expenses: 0, rows: []).data.hasNoData))
        #expect(!(try report("2026-10-01", income: 0, expenses: 10, rows: []).data.hasNoData))
        #expect(!(try report("2026-10-01", income: 0, expenses: 0, rows: [("Groceries", 0)]).data.hasNoData))
    }
}

/// 9.38 / 9.39: the cache remembers when it fetched a report, and can forget a month.
struct ReportCacheEntryTests {
    private func make() -> (ReportCache, AccountScope, URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("entry-\(UUID().uuidString)")
        let scope = AccountScope(userID: "user-a")
        return (ReportCache(directory: dir, scope: scope), scope, dir)
    }

    @Test func theFetchTimeIsStoredWithTheReport() throws {
        let (cache, scope, dir) = make()
        defer { try? FileManager.default.removeItem(at: dir) }
        let fetched = Date(timeIntervalSince1970: 1_794_614_400)
        cache.store(try Fixture.october, fetchedAt: fetched, token: scope.token())
        let entry = try #require(cache.entry(month: Month(year: 2026, month: 10)))
        #expect(entry.fetchedAt == fetched)
        #expect(entry.report.month == Month(year: 2026, month: 10))
        #expect(cache.load(month: Month(year: 2026, month: 10)) != nil)
    }

    @Test func aMonthCanBeForgotten() throws {
        let (cache, scope, dir) = make()
        defer { try? FileManager.default.removeItem(at: dir) }
        cache.store(try Fixture.october, fetchedAt: .now, token: scope.token())
        cache.store(try Fixture.september, fetchedAt: .now, token: scope.token())
        cache.remove(month: Month(year: 2026, month: 10), token: scope.token())
        #expect(cache.load(month: Month(year: 2026, month: 10)) == nil)
        #expect(cache.load(month: Month(year: 2026, month: 9)) != nil)
    }

    @Test func aStaleTokenForgetsNothing() throws {
        let (cache, scope, dir) = make()
        defer { try? FileManager.default.removeItem(at: dir) }
        let old = scope.token()
        cache.store(try Fixture.october, fetchedAt: .now, token: old)
        scope.end()
        scope.begin(userID: "user-a")
        cache.remove(month: Month(year: 2026, month: 10), token: old)
        #expect(cache.load(month: Month(year: 2026, month: 10)) != nil)
    }
}

/// 3.10: with a previous month, a wants category that is new this month can still get the budget suggestion.
struct NewCategorySuggestionTests {
    /// October from the fixture with Gym (absent in September) raised to $600.
    private func octoberWithBigGym() throws -> Report {
        let json = try JSONEncoder().encode(try Fixture.october)
        var object = try #require(JSONSerialization.jsonObject(with: json) as? [String: Any])
        var data = try #require(object["report_data"] as? [String: Any])
        let rows = try #require(data["by_category"] as? [[String: Any]])
        data["by_category"] = rows.map { row -> [String: Any] in
            var row = row
            if row["category"] as? String == "Gym" { row["amount"] = 600 }
            return row
        }
        object["report_data"] = data
        return try JSONDecoder().decode(Report.self, from: JSONSerialization.data(withJSONObject: object))
    }

    @Test func aBrandNewCategoryCountsItsWholeAmountAsTheIncrease() throws {
        let september = try Fixture.september
        let result = suggestions(current: try octoberWithBigGym(), previous: september, history: [september],
                                 categories: Fixture.categories)
        let budget = try #require(result.first { if case .setBudget = $0.action { true } else { false } })
        // Gym (+$600 from nothing) beats Dining out (+$310). September had no Gym, so the budget starts from this
        // month's amount rather than an average of $0.
        #expect(budget.action == .setBudget(categoryID: "c5", categoryName: "Gym", amount: 600))
        #expect(budget.detail.hasPrefix("Gym is new since September at $600."))
    }
}
