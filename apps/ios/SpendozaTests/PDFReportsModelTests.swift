import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct PDFReportsModelTests {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 12))! }

    private func model(_ api: StubAPI = StubAPI()) -> PDFReportsModel {
        PDFReportsModel(api: api, now: now, calendar: calendar)
    }

    @Test func optionsAreTheLastTwelveMonthsThenTheRanges() {
        let options = model().options
        #expect(options.count == 15)
        #expect(options[0].title == "October 2026 so far")
        #expect(options[0].period == .month(Month(year: 2026, month: 10)))
        #expect(options[1].title == "September 2026")
        #expect(options[11].title == "November 2025")
        #expect(options[12].title == "Last 3 months")
        #expect(options[12].period == .range(from: Month(year: 2026, month: 8), to: Month(year: 2026, month: 10)))
        #expect(options[13].title == "This year")
        #expect(options[13].period == .range(from: Month(year: 2026, month: 1), to: Month(year: 2026, month: 10)))
        #expect(options[14].title == "Last year")
        #expect(options[14].period == .range(from: Month(year: 2025, month: 1), to: Month(year: 2025, month: 12)))
    }

    @Test func exportWritesTheFileUnderItsName() async throws {
        let api = StubAPI()
        api.pdfResult = .success(PDFFile(data: Data("%PDF-stub".utf8), filename: "spendoza-report-2026-09.pdf"))
        let m = model(api)
        let url = try #require(await m.export(m.options[1]))
        #expect(url.lastPathComponent == "spendoza-report-2026-09.pdf")
        #expect(try Data(contentsOf: url) == Data("%PDF-stub".utf8))
        #expect(api.calls == ["personalReportPDF(month(SpendozaKit.Month(year: 2026, month: 9)))"])
        #expect(m.exporting == nil)
        #expect(m.error == nil)
    }

    @Test func discardingAnExportRemovesItsFolderOnly() async throws {
        defer { PDFReportsModel.clearExports() }
        let m = model()
        let first = try #require(await m.export(m.options[0]))
        let second = try #require(await m.export(m.options[1]))
        PDFReportsModel.discard(first)
        #expect(!FileManager.default.fileExists(atPath: first.deletingLastPathComponent().path))
        #expect(FileManager.default.fileExists(atPath: second.path))
        // A file outside the exports root is never touched.
        let outside = FileManager.default.temporaryDirectory.appendingPathComponent("keep-\(UUID().uuidString)")
        try Data("x".utf8).write(to: outside)
        defer { try? FileManager.default.removeItem(at: outside) }
        PDFReportsModel.discard(outside)
        #expect(FileManager.default.fileExists(atPath: outside.path))
    }

    @Test func clearingExportsRemovesTheWholeRoot() async throws {
        let m = model()
        let url = try #require(await m.export(m.options[0]))
        #expect(FileManager.default.fileExists(atPath: url.path))
        PDFReportsModel.clearExports()
        #expect(!FileManager.default.fileExists(atPath: PDFReportsModel.exportsRoot.path))
    }

    @Test func aPeriodWithNoDataShowsTheServersWordsAndReturnsNil() async {
        let api = StubAPI()
        api.pdfResult = .failure(.message("No report data available for this period"))
        let m = model(api)
        #expect(await m.export(m.options[0]) == nil)
        #expect(m.error == "No report data available for this period")
        #expect(m.exporting == nil)
    }
}
