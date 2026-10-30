import Foundation
import Testing
@testable import SpendozaKit

@Suite struct ReportDecodingTests {
    @Test func octoberDecodes() throws {
        let report = try Fixture.october
        let health = try #require(report.data.health)
        #expect(report.month == Month(apiString: "2026-10-01"))
        #expect(health.score == 64)
        #expect(health.previousScore == 73)
        #expect(health.parts[.wants]?.points == 9)
        #expect(health.parts[.wants]?.rating == .warning)
        #expect(health.parts[.savingsRate]?.value == 16.0)
        #expect(health.parts[.debtToIncome]?.value == 0.45)
        #expect(health.parts.count == 5)
        #expect(report.data.totalIncome == 5000)
        #expect(report.data.byCategory.first { $0.category == "Dining out" }?.amount == 430)
        #expect(report.generatedAt == Date(timeIntervalSince1970: 1_793_179_800))
    }

    @Test func insightsSplitIntoBulletLines() throws {
        #expect(try Fixture.october.insights == [
            "Dining out rose sharply this month.",
            "Your wants are over 30% of income.",
            "Build your emergency fund toward 3 months.",
        ])
    }

    @Test func nullInsightsAreEmpty() throws {
        #expect(try Fixture.september.insights == [])
        #expect(try Fixture.september.generatedAt == Date(timeIntervalSince1970: 1_790_847_000))
    }

    @Test func missingHealthScoreDecodesAsNil() throws {
        var object = try #require(JSONSerialization.jsonObject(with: Fixture.data("report-2026-10")) as? [String: Any])
        var data = try #require(object["report_data"] as? [String: Any])
        data.removeValue(forKey: "financial_health_score")
        object["report_data"] = data
        let json = try JSONSerialization.data(withJSONObject: object)
        let report = try JSONDecoder().decode(Report.self, from: json)
        #expect(report.data.health == nil)
    }

    @Test func monthParsingAndNaming() throws {
        let month = try #require(Month(apiString: "2026-10-01"))
        #expect(month.name == "October")
        #expect(month.apiString == "2026-10-01")
        #expect(month.previous == Month(apiString: "2026-09-01"))
        #expect(Month(apiString: "2026-01-01")?.previous == Month(apiString: "2025-12-01"))
        #expect(try #require(Month(apiString: "2026-09-01")) < month)
        #expect(Month(apiString: "nope") == nil)
        #expect(Month(apiString: "2026-13-01") == nil)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let date = Date(timeIntervalSince1970: 1_793_179_800)
        #expect(Month(date: date, calendar: calendar) == month)
    }
}
