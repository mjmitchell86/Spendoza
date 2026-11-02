import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct OverviewModelTests {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 12))! }
    private let sep = Month(year: 2026, month: 9)
    private let oct = Month(year: 2026, month: 10)

    private func day(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    private func bill(_ id: String, _ name: String, due: Date, amount: Double = 20, auto: Bool = false,
                      frequency: ExpenseFrequency = .recurring) -> Expense {
        Expense(id: id, categoryID: "c4", description: name, amount: amount, frequency: frequency,
                interval: frequency == .recurring ? .monthly : nil, nextDueDate: due, autoDetected: auto)
    }

    private func model(_ api: StubAPI, month: Month? = nil, poller: StatementPoller? = nil) -> OverviewModel {
        OverviewModel(api: api, month: month ?? sep, poller: poller ?? StatementPoller(api: api, sleep: SleepLog().sleeper),
                      now: { now }, calendar: calendar)
    }

    private func report(_ month: Month, income: Double = 5000, expenses: Double = 4000, rate: Double = 20,
                        categories: [(String, Double)] = [("Housing", 1800), ("Dining out", 300)]) -> Report {
        let rows = categories.map { "{ \"category\": \"\($0.0)\", \"amount\": \($0.1), \"percentage\": 1 }" }.joined(separator: ",")
        let json = """
        { "id": "r", "report_month": "\(month.apiString)",
          "report_data": { "total_income": \(income), "total_expenses": \(expenses), "savings_rate": \(rate),
            "by_category": [\(rows)] },
          "ai_insights": null, "generated_at": "2026-11-01T09:30:00.000Z" }
        """
        return try! JSONDecoder().decode(Report.self, from: Data(json.utf8))
    }

    // MARK: In versus out

    @Test func moneyInAndOutComeFromTheReport() async {
        let api = StubAPI()
        api.reports[sep] = report(sep, income: 5200, expenses: 4100, rate: 21.0769)
        let m = model(api)
        await m.load()
        #expect(m.totals?.income == 5200)
        #expect(m.totals?.expenses == 4100)
        #expect(m.totals?.net == 1100)
        #expect(m.totals?.savingsRateText == "21.1%")
        #expect(m.totals?.overspendNote == nil)
        #expect(api.requestedMonths == [sep])
    }

    @Test func aNegativeSavingsRateSaysHowMuchWasOverspent() async {
        let api = StubAPI()
        api.reports[sep] = report(sep, income: 3000, expenses: 3360, rate: -12.04)
        let m = model(api)
        await m.load()
        #expect(m.totals?.savingsRateText == "-12.0%")
        #expect(m.totals?.overspendNote == "You spent 12% more than you earned")
        #expect(m.totals?.net == -360)
    }

    @Test func spendingByCategoryIsBiggestFirstWithEachShare() async {
        let api = StubAPI()
        api.reports[sep] = report(sep, categories: [("Dining out", 300), ("Housing", 1800), ("Streaming", 100)])
        let m = model(api)
        await m.load()
        #expect(m.categoryRows.map(\.name) == ["Housing", "Dining out", "Streaming"])
        #expect(m.categoryRows.map(\.amount) == [1800, 300, 100])
        // Shares are of the categories' total (2200), rounded to whole percents like the web.
        #expect(m.categoryRows.map(\.sharePercent) == [82, 14, 5])
        #expect(m.categoryRows[0].barFraction == 1)
        #expect(abs(m.categoryRows[1].barFraction - 300.0 / 1800.0) < 0.0001)
    }

    // MARK: Empty and failing

    @Test func aMonthWithoutAReportHasNothingToShow() async {
        let m = model(StubAPI())
        await m.load()
        #expect(m.report == nil)
        #expect(m.hasLoaded)
        #expect(m.isEmpty)
        #expect(m.emptyText == "No transactions for September")
    }

    @Test func aReportWithNoDataCountsAsNoReport() async {
        let api = StubAPI()
        api.reports[sep] = report(sep, income: 0, expenses: 0, rate: 0, categories: [])
        let m = model(api)
        await m.load()
        #expect(m.isEmpty)
    }

    @Test func aFailedLoadShowsTheServersWords() async {
        let api = StubAPI()
        api.reportError = .message("Something broke")
        let m = model(api)
        await m.load()
        #expect(m.loadError == "Something broke")
        #expect(!m.isEmpty)
    }

    @Test func anEndedSessionIsHandedToSignOut() async {
        let api = StubAPI()
        api.reportError = .unauthorized
        let m = model(api)
        var ended = false
        m.onSessionEnded = { ended = true }
        await m.load()
        #expect(ended)
    }

    // MARK: Upcoming bills

    @Test func reloadingUpcomingFetchesOnlyTheBills() async {
        let api = StubAPI()
        api.upcomingBillList = [bill("b1", "Phone", due: day(2026, 11, 20))]
        let m = model(api)
        await m.load()
        api.upcomingBillList = [bill("b1", "Phone", due: day(2026, 11, 20)), bill("b5", "Gym", due: day(2026, 11, 2))]
        let reports = api.requestedMonths.count
        await m.reloadUpcoming()
        #expect(m.upcoming.map(\.id) == ["b5", "b1"])
        // A bill changing doesn't touch the report or the statements.
        #expect(api.requestedMonths.count == reports)
        #expect(api.calls.filter { $0 == "statements" }.count == 1)
    }

    @Test func upcomingBillsStartTodayAndRunSoonestFirst() async {
        let api = StubAPI()
        api.upcomingBillList = [
            bill("b1", "Phone", due: day(2026, 11, 20)),
            bill("b2", "Netflix", due: day(2026, 10, 30)),
            bill("b3", "Old gym", due: day(2026, 10, 12)),
            bill("b4", "Rent", due: day(2026, 11, 1), auto: true),
        ]
        let m = model(api)
        await m.load()
        #expect(m.upcoming.map(\.id) == ["b2", "b4", "b1"])
        #expect(api.calls.contains("upcomingBills"))
    }

    @Test func upcomingRowsSayTodayAndDaysAndFlagTheNearOnes() async {
        let api = StubAPI()
        api.upcomingBillList = [
            bill("b1", "Netflix", due: day(2026, 10, 30), amount: 15.49),
            bill("b2", "Rent", due: day(2026, 11, 2), amount: 1800, auto: true),
            bill("b3", "Phone", due: day(2026, 11, 3)),
            bill("b4", "Insurance", due: day(2026, 11, 20)),
        ]
        let m = model(api)
        await m.load()
        let rows = m.upcomingRows
        #expect(rows.map(\.whenText) == ["Oct 30 (today)", "Nov 2 (in 3d)", "Nov 3 (in 4d)", "Nov 20 (in 21d)"])
        #expect(rows.map(\.isSoon) == [true, true, false, false])
        #expect(rows.map(\.isAuto) == [false, true, false, false])
        #expect(rows[0].amount == 15.49)
    }

    @Test func aBillShowsItsFriendlyNameWhenItHasOne() async {
        let api = StubAPI()
        api.upcomingBillList = [Expense(id: "b1", categoryID: "c4", description: "NETFLIX.COM 8667", friendlyName: "Netflix",
                                        amount: 15.49, frequency: .recurring, interval: .monthly, nextDueDate: day(2026, 11, 5))]
        let m = model(api)
        await m.load()
        #expect(m.upcomingRows.first?.name == "Netflix")
    }

    @Test func upcomingBillsFailingLeavesTheReportAlone() async {
        let api = StubAPI()
        api.reports[sep] = report(sep)
        api.moneyErrors["upcomingBills"] = .offline
        let m = model(api)
        await m.load()
        #expect(m.report != nil)
        #expect(m.upcoming.isEmpty)
        #expect(m.loadError == nil)
    }

    // MARK: Statements this month

    @Test func statementsAreTheSelectedMonthsOnly() async {
        let api = StubAPI()
        api.statementScript = [[
            Statement(id: "s1", status: .parsed, fileType: "pdf", createdAt: now, statementMonth: sep),
            Statement(id: "s2", status: .processing, fileType: "csv", createdAt: now, statementMonth: oct),
            Statement(id: "s3", status: .failed, fileType: "pdf", createdAt: now, statementMonth: sep),
            Statement(id: "s4", status: .uploaded, fileType: "pdf", createdAt: now),
        ]]
        let m = model(api)
        await m.load()
        // s4 is still being read, so it has no month yet: it shows until it gets one.
        #expect(m.statements.map(\.id) == ["s1", "s3", "s4"])
    }

    @Test func aStatementWithNoMonthShowsWhileItIsBeingReadOrWhenItFailed() async throws {
        let api = StubAPI()
        api.statementScript = [[
            Statement(id: "up", status: .uploaded, fileType: "pdf", createdAt: now),
            Statement(id: "pr", status: .processing, fileType: "csv", createdAt: now),
            Statement(id: "fa", status: .failed, fileType: "pdf", createdAt: now,
                      failure: StatementFailure(reason: "Couldn't read this PDF")),
            Statement(id: "ok", status: .parsed, fileType: "pdf", createdAt: now),
            Statement(id: "oct", status: .processing, fileType: "pdf", createdAt: now, statementMonth: oct),
        ]]
        let m = model(api)
        await m.load()
        // A statement that failed before it got a month would otherwise vanish from every month.
        try #require(m.statements.map(\.id) == ["up", "pr", "fa"])
        let failed = m.statementRows[2]
        #expect(failed.statusText == "Failed")
        #expect(failed.monthText == "Pending")
        #expect(failed.failure?.reason == "Couldn't read this PDF")
    }

    @Test func overviewStatementRowsUseTheListsWords() async {
        let api = StubAPI()
        api.statementScript = [[
            Statement(id: "s1", status: .parsed, fileType: "pdf", createdAt: now, statementMonth: sep),
            Statement(id: "s2", status: .processing, fileType: "csv", bankName: "Amex", createdAt: now,
                      pipelineStep: "classify_transactions"),
        ]]
        let m = model(api)
        await m.load()
        #expect(m.statementRows.map(\.title) == ["Unknown bank", "Amex"])
        #expect(m.statementRows.map(\.statusText) == ["Parsed", "Processing"])
        #expect(m.statementRows[1].progress == "Classifying")
    }

    @Test func statementsComeFromTheSharedPollerAndFollowItsUpdates() async {
        let api = StubAPI()
        api.statementScript = [[Statement(id: "s1", status: .processing, fileType: "pdf", createdAt: now, statementMonth: sep)],
                               [Statement(id: "s1", status: .parsed, fileType: "pdf", createdAt: now, statementMonth: sep)]]
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        let m = model(api, poller: poller)
        await m.load()
        #expect(m.statements.map(\.status) == [.processing])
        await poller.waitUntilIdle()
        #expect(m.statements.map(\.status) == [.parsed])
        // One poller, one request per poll: the model never asks for the list itself.
        #expect(api.calls.filter { $0 == "statements" }.count == 2)
    }

    @Test func theEmptyMonthOffersToAddAStatement() async {
        let api = StubAPI()
        let m = model(api)
        await m.load()
        #expect(m.isEmpty)
        #expect(m.emptyText == "No transactions for September")
        #expect(m.offersAddStatement)
    }

    @Test func aMonthWithAReportDoesNotOfferTheEmptyStateAction() async {
        let api = StubAPI()
        api.reports[sep] = report(sep)
        let m = model(api)
        await m.load()
        #expect(!m.offersAddStatement)
    }

    // MARK: Refresh

    @Test func refreshAsksForTheSelectedMonthThenReloads() async {
        let api = StubAPI()
        api.reports[sep] = report(sep)
        let m = model(api)
        await m.load()
        let message = await m.refresh()
        #expect(message == nil)
        #expect(api.calls.contains("generateReport(2026-09-01)"))
        #expect(api.requestedMonths == [sep, sep])
        #expect(!m.refreshing)
    }

    @Test func refreshAtTheLimitReturnsTheServersMessage() async {
        let api = StubAPI()
        api.reports[sep] = report(sep)
        api.moneyErrors["generateReport"] = .message("Report generation limit reached (2 per 24 hours)")
        let m = model(api)
        await m.load()
        let message = await m.refresh()
        #expect(message == "Report generation limit reached (2 per 24 hours)")
        // The report on screen stays, and nothing was reloaded.
        #expect(m.report != nil)
        #expect(api.requestedMonths == [sep])
    }

    // MARK: Export

    @Test func exportPDFWritesTheMonthsFile() async throws {
        defer { PDFReportsModel.clearExports() }
        let api = StubAPI()
        api.pdfResult = .success(PDFFile(data: Data("%PDF-stub".utf8), filename: "spendoza-report-2026-09.pdf"))
        let m = model(api)
        let url = try #require(await m.exportPDF())
        #expect(url.lastPathComponent == "spendoza-report-2026-09.pdf")
        #expect(api.calls.contains("personalReportPDF(month(SpendozaKit.Month(year: 2026, month: 9)))"))
        #expect(m.exportError == nil)
    }

    @Test func exportPDFFailureIsShown() async {
        let api = StubAPI()
        api.pdfResult = .failure(.message("No report for that month"))
        let m = model(api)
        let url = await m.exportPDF()
        #expect(url == nil)
        #expect(m.exportError == "No report for that month")
    }
}

@MainActor
struct MoneyMonthsTests {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 2, day: 10, hour: 12))! }

    @Test func theMenuIsTheMonthSoFarThenElevenBeforeIt() {
        let choices = MoneyMonths.choices(now: now, calendar: calendar)
        #expect(choices.count == 12)
        #expect(choices[0].title == "February so far")
        #expect(choices[0].month == Month(year: 2026, month: 2))
        #expect(choices[1].title == "January")
        #expect(choices[2].title == "December 2025")
        #expect(choices[11].title == "March 2025")
        #expect(choices[11].month == Month(year: 2025, month: 3))
    }

    @Test func opensOnTheLastFinishedMonthThatHasData() async {
        let api = StubAPI()
        let dec = Month(year: 2025, month: 12)
        api.reports[dec] = StubAPI.report(dec, score: 60, previous: nil, points: [20, 20, 10, 5, 5])
        let model = MoneyModel(api: api, now: { now }, calendar: calendar)
        await model.open()
        #expect(model.selected == dec)
        // January had nothing; it was asked before December.
        #expect(api.requestedMonths.prefix(2) == [Month(year: 2026, month: 1), dec])
    }

    @Test func withNoDataAnywhereItOpensOnTheLastFinishedMonth() async {
        let model = MoneyModel(api: StubAPI(), now: { now }, calendar: calendar)
        await model.open()
        #expect(model.selected == Month(year: 2026, month: 1))
    }

    @Test func aMonthInProgressWithDataIsUsedWhenNoFinishedOneHasAny() async {
        let api = StubAPI()
        let feb = Month(year: 2026, month: 2)
        api.reports[feb] = StubAPI.report(feb, score: 60, previous: nil, points: [20, 20, 10, 5, 5])
        let model = MoneyModel(api: api, now: { now }, calendar: calendar)
        await model.open()
        #expect(model.selected == feb)
    }
}
