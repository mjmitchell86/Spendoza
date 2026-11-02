import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct StatementsModelTests {
    private let when = Date(timeIntervalSince1970: 1_792_000_000)
    private let oct = Month(year: 2026, month: 10)

    private func make(_ api: StubAPI) -> (StatementsModel, StatementPoller) {
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        return (StatementsModel(api: api, poller: poller), poller)
    }

    private func row(_ statement: Statement) -> StatementRow { StatementsModel.row(statement) }

    // MARK: Rows

    @Test func aParsedRowShowsBankMonthAccountAndStatus() {
        let r = row(Statement(id: "s", status: .parsed, fileType: "pdf", bankName: "Chase", createdAt: when, statementMonth: oct))
        #expect(r.title == "Chase")
        #expect(r.monthText == "October 2026")
        #expect(r.accountText == "Personal")
        #expect(r.statusText == "Parsed")
        #expect(r.progress == nil)
        #expect(r.failure == nil)
    }

    @Test func aRowWithNoBankOrMonthUsesTheFallbacks() {
        let r = row(Statement(id: "s", status: .uploaded, fileType: "csv", bankName: "  ", createdAt: when, isShared: true))
        #expect(r.title == "Unknown bank")
        #expect(r.monthText == "Pending")
        #expect(r.accountText == "Shared")
        #expect(r.statusText == "Uploaded")
    }

    @Test func aSharedAccountShowsItsLabel() {
        let r = row(Statement(id: "s", status: .parsed, fileType: "pdf", accountLabel: "Joint Checking", createdAt: when, isShared: true))
        #expect(r.accountText == "Shared · Joint Checking")
    }

    @Test func processingShowsTheStepInTheWebsWords() {
        func progress(_ step: String?, _ type: String = "pdf") -> String? {
            row(Statement(id: "s", status: .processing, fileType: type, createdAt: when, pipelineStep: step)).progress
        }
        #expect(progress("extract_text") == "Reading PDF")
        #expect(progress("extract_text", "csv") == "Reading CSV")
        #expect(progress("extract_transactions") == "Extracting transactions")
        #expect(progress("classify_transactions") == "Classifying")
        #expect(progress("match_and_insert") == "Matching & saving")
        #expect(progress(nil) == "Processing")
    }

    @Test func aRetriedStatementShowsTheAttempt() {
        let r = row(Statement(id: "s", status: .processing, fileType: "pdf", createdAt: when,
                              pipelineStep: "classify_transactions", retryCount: 1))
        #expect(r.progress == "Retrying (1/2) — Classifying")
    }

    @Test func aFailedRowShowsTheReasonAndTheStep() {
        let failure = StatementFailure(reason: "Could not read the PDF", step: "extract_text", retryCount: 0)
        let r = row(Statement(id: "s", status: .failed, fileType: "pdf", createdAt: when, failure: failure))
        #expect(r.failure == .init(headline: "Failed to process this statement.", step: "Failed during: Reading PDF",
                                   reason: "Could not read the PDF"))
        #expect(r.isFailed)
    }

    @Test func aFailedRowNamesTheRetries() {
        func headline(_ retries: Int) -> String? {
            let failure = StatementFailure(reason: "x", step: nil, retryCount: retries)
            return row(Statement(id: "s", status: .failed, fileType: "pdf", createdAt: when, failure: failure, retryCount: retries)).failure?.headline
        }
        #expect(headline(1) == "Failed after 1 retry.")
        #expect(headline(2) == "Failed after 2 retries.")
    }

    @Test func aFailedRowWithoutAReasonOmitsTheReasonLine() {
        // The server's `parsed_data` had no `error`: the decoded reason is "".
        let blank = StatementFailure(reason: "", step: "match_and_insert", retryCount: 2)
        let r = row(Statement(id: "s", status: .failed, fileType: "pdf", createdAt: when, failure: blank, retryCount: 2))
        #expect(r.failure?.reason == nil)
        #expect(r.failure?.headline == "Failed after 2 retries.")
        #expect(r.failure?.step == "Failed during: Matching & saving")
        let spaces = StatementFailure(reason: "  \n", step: nil, retryCount: 0)
        #expect(row(Statement(id: "s", status: .failed, fileType: "pdf", createdAt: when, failure: spaces)).failure?.reason == nil)
        #expect(!r.accessibilitySummary.contains(", ,"))
    }

    @Test func aFailedStatementDecodedWithoutAnErrorHasNoBlankReason() throws {
        let json = """
        {"id":"s","status":"failed","file_type":"pdf","bank_name":null,"account_label":null,
         "statement_month":null,"is_shared_account":false,"created_at":"2026-11-01T09:30:00Z",
         "parsed_data":{"failed_step":"extract_text","retry_count":2}}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let r = row(try decoder.decode(Statement.self, from: Data(json.utf8)))
        #expect(r.failure?.reason == nil)
        #expect(r.failure?.headline == "Failed after 2 retries.")
    }

    // MARK: Loading

    @Test func loadingFillsTheRowsFromThePoller() async {
        let api = StubAPI()
        api.statementScript = [[Statement(id: "s1", status: .parsed, fileType: "pdf", bankName: "Chase", createdAt: when)]]
        let (model, _) = make(api)
        #expect(model.isLoading)
        await model.load()
        #expect(!model.isLoading)
        #expect(model.rows.map(\.title) == ["Chase"])
    }

    @Test func aFailedLoadWithNothingToShowSaysWhy() async {
        let api = StubAPI()
        api.statementError = .message("Too many requests")
        let (model, _) = make(api)
        await model.load()
        #expect(model.loadError == "Too many requests")
    }

    @Test func bankNamesAreDistinctAndSorted() async {
        let api = StubAPI()
        api.statementScript = [[
            Statement(id: "a", status: .parsed, fileType: "pdf", bankName: "Chase", createdAt: when),
            Statement(id: "b", status: .parsed, fileType: "pdf", bankName: "amex", createdAt: when),
            Statement(id: "c", status: .parsed, fileType: "pdf", bankName: "chase", createdAt: when),
            Statement(id: "d", status: .parsed, fileType: "pdf", createdAt: when),
        ]]
        let (model, _) = make(api)
        await model.load()
        #expect(model.bankNames == ["amex", "Chase"])
    }

    // MARK: Upload

    private func file(_ name: String, bytes: Int = 10) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let handle = try FileHandle(forWritingTo: url)
        try handle.truncate(atOffset: UInt64(bytes))
        try handle.close()
        return url
    }

    @Test func uploadReportsEachFilesProblemAndKeepsGoing() async throws {
        let api = StubAPI()
        api.uploadResults = [.success(StubAPI.statement(id: "n1", status: .processing)), .failure(.message("Duplicate statement")),
                             .success(StubAPI.statement(id: "n2", status: .processing))]
        let (model, _) = make(api)
        let files = [try file("a.pdf"), try file("notes.txt"), try file("big.pdf", bytes: APIClient.maxStatementBytes + 1),
                     try file("dup.csv"), try file("b.csv")]
        let problems = await model.upload(files: files, bankName: "Chase", shared: false, accountLabel: "")
        #expect(problems == [
            "notes.txt": "notes.txt: not a PDF or CSV",
            "big.pdf": "This file is too large (max 4 MB)",
            "dup.csv": "Duplicate statement",
        ])
        let uploads = api.calls.filter { $0.hasPrefix("upload(") }
        #expect(uploads == ["upload(a.pdf, application/pdf) bank=Chase", "upload(dup.csv, text/csv) bank=Chase",
                            "upload(b.csv, text/csv) bank=Chase"])
        #expect(!model.isUploading)
    }

    @Test func uploadSendsTheSharedAccountAndItsLabel() async throws {
        let api = StubAPI()
        let (model, _) = make(api)
        let problems = await model.upload(files: [try file("a.pdf")], bankName: "", shared: true, accountLabel: " Joint Checking ")
        #expect(problems.isEmpty)
        #expect(api.calls.contains("upload(a.pdf, application/pdf) shared label=Joint Checking"))
    }

    @Test func aLabelWithoutSharingIsNotSent() async throws {
        let api = StubAPI()
        let (model, _) = make(api)
        _ = await model.upload(files: [try file("a.pdf")], bankName: "", shared: false, accountLabel: "Joint")
        #expect(api.calls.contains("upload(a.pdf, application/pdf)"))
    }

    @Test func anOfflineFileGetsAGenericProblemAndTheRestGoOn() async throws {
        let api = StubAPI()
        api.uploadResults = [.failure(.offline), .success(StubAPI.statement(id: "n", status: .processing))]
        let (model, _) = make(api)
        let problems = await model.upload(files: [try file("a.pdf"), try file("b.pdf")], bankName: "", shared: false, accountLabel: "")
        #expect(problems == ["a.pdf": "You're offline. Check your connection and try again."])
    }

    @Test func uploadRestartsPollingAfterItsRefresh() async throws {
        let api = StubAPI()
        api.statementScript = [[Statement(id: "n", status: .processing, fileType: "pdf", createdAt: when)],
                               [Statement(id: "n", status: .parsed, fileType: "pdf", createdAt: when)]]
        let (model, poller) = make(api)
        _ = await model.upload(files: [try file("a.pdf")], bankName: "", shared: false, accountLabel: "")
        #expect(poller.isPolling)
        await poller.waitUntilIdle()
        #expect(model.rows.map(\.status) == [.parsed])
    }

    @Test func uploadThatAllFailsDoesNotRefresh() async throws {
        let api = StubAPI()
        let (model, _) = make(api)
        _ = await model.upload(files: [try file("notes.txt")], bankName: "", shared: false, accountLabel: "")
        #expect(!api.calls.contains("statements"))
    }

    // MARK: Retry and remove

    @Test func retryReprocessesThenRefreshes() async {
        let api = StubAPI()
        api.statementScript = [[Statement(id: "f", status: .processing, fileType: "pdf", createdAt: when, retryCount: 0)]]
        let (model, poller) = make(api)
        await model.retry("f")
        #expect(api.calls.prefix(2) == ["reprocess(f)", "statements"])
        #expect(model.actionError == nil)
        #expect(model.busy.isEmpty)
        poller.stop()
    }

    @Test func aRefusedRetryShowsTheServersWords() async {
        let api = StubAPI()
        api.reprocessError = .message("Statement not found")
        let (model, _) = make(api)
        await model.retry("f")
        #expect(model.actionError == "Statement not found")
        #expect(!api.calls.contains("statements"))
    }

    @Test func removeDeletesThenRefreshes() async {
        let api = StubAPI()
        let (model, _) = make(api)
        await model.remove("f")
        #expect(api.calls == ["remove(f)", "statements"])
    }

    @Test func aFailedRemoveSaysSo() async {
        let api = StubAPI()
        api.removeError = .offline
        let (model, _) = make(api)
        await model.remove("f")
        #expect(model.actionError == "You're offline. Check your connection and try again.")
    }

    @Test func anEndedSessionIsReported() async {
        let api = StubAPI()
        api.reprocessError = .unauthorized
        let (model, _) = make(api)
        var ended = 0
        model.onSessionEnded = { ended += 1 }
        await model.retry("f")
        #expect(ended == 1)
        #expect(model.actionError == nil)
    }
}
