import Foundation
import Testing
@testable import SpendozaKit

struct WidgetSummaryTests {
    private let oct = Month(year: 2026, month: 10)

    @Test func downLine() {
        #expect(WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: oct).summaryLine == "Fair \u{00B7} down 9")
    }

    @Test func upLine() {
        #expect(WidgetSnapshot(score: 75, band: .good, previousScore: 72, month: oct).summaryLine == "Good \u{00B7} up 3")
    }

    @Test func sameLine() {
        #expect(WidgetSnapshot(score: 30, band: .low, previousScore: 30, month: oct).summaryLine == "Low \u{00B7} same")
    }

    @Test func noPreviousScoreIsBandOnly() {
        #expect(WidgetSnapshot(score: 64, band: .fair, previousScore: nil, month: oct).summaryLine == "Fair")
    }
}
