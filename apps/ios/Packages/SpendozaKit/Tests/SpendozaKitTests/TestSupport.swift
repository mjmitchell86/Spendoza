import Foundation
import Testing
@testable import SpendozaKit

enum Fixture {
    static func data(_ name: String) throws -> Data {
        let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    static func report(_ name: String) throws -> Report {
        try JSONDecoder().decode(Report.self, from: data(name))
    }

    static var october: Report { get throws { try report("report-2026-10") } }
    static var september: Report { get throws { try report("report-2026-09") } }

    static let categories: [BudgetCategory] = [
        .init(id: "c1", name: "Housing", budgetClass: .need),
        .init(id: "c2", name: "Groceries", budgetClass: .need),
        .init(id: "c3", name: "Dining out", budgetClass: .want),
        .init(id: "c4", name: "Streaming", budgetClass: .want),
        .init(id: "c5", name: "Gym", budgetClass: .want),
    ]
}
