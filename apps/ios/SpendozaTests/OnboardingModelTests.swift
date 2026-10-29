import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct OnboardingModelTests {
    private let chicago = TimeZone(identifier: "America/Chicago")!

    private func model(_ api: StubAPI, maxPolls: Int = 5) -> OnboardingModel {
        OnboardingModel(api: api, timeZone: chicago, pollInterval: .zero, maxPolls: maxPolls, sleep: { _ in })
    }

    private func tempFile(_ name: String, bytes: Int = 10) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ob-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        try Data(count: bytes).write(to: url)
        return url
    }

    private func processing(_ api: StubAPI, ids: [String]) -> OnboardingModel {
        let m = model(api)
        m.begin()
        m.startProcessing(ids.map { StubAPI.statement(id: $0, status: .processing) })
        return m
    }

    // MARK: Steps

    @Test func startsOnWelcomeAndWalksToUploadAndBack() {
        let m = model(StubAPI())
        #expect(m.step == .welcome)
        m.begin()
        #expect(m.step == .upload)
        m.back()
        #expect(m.step == .welcome)
    }

    @Test func skipGoesStraightToComplete() {
        let m = model(StubAPI())
        m.begin()
        m.skipUpload()
        #expect(m.step == .complete)
    }

    // MARK: Upload

    @Test func uploadMovesToProcessing() async throws {
        let api = StubAPI()
        let m = model(api)
        m.begin()
        await m.upload(fileURL: try tempFile("march.pdf"))
        #expect(m.step == .processing)
        #expect(m.statementIDs.count == 1)
        #expect(api.calls.contains { $0.hasPrefix("upload(march.pdf, application/pdf)") })
    }

    @Test func csvUploadsAsTextCSVAndSeveralFilesAllTrack() async throws {
        let api = StubAPI()
        let m = model(api)
        m.begin()
        await m.upload(fileURLs: [try tempFile("a.csv"), try tempFile("b.PDF")])
        #expect(api.calls.filter { $0.hasPrefix("upload") }.count == 2)
        #expect(api.calls.contains { $0.hasSuffix("text/csv)") })
        #expect(api.calls.contains { $0.hasSuffix("application/pdf)") })
        #expect(m.statementIDs.count == 2)
        #expect(m.step == .processing)
    }

    @Test func fileOverTheLimitIsRefusedBeforeUploading() async throws {
        let api = StubAPI()
        let m = model(api)
        m.begin()
        await m.upload(fileURL: try tempFile("big.pdf", bytes: APIClient.maxStatementBytes + 1))
        #expect(m.step == .upload)
        #expect(m.uploadError == "This file is too large (max \(APIClient.maxStatementMB) MB)")
        #expect(api.calls.filter { $0.hasPrefix("upload") }.isEmpty)
    }

    @Test func otherFileTypesAreRefused() async throws {
        let api = StubAPI()
        let m = model(api)
        m.begin()
        await m.upload(fileURL: try tempFile("photo.png"))
        #expect(m.step == .upload)
        #expect(m.uploadError == "Choose a PDF or CSV file.")
        #expect(api.calls.isEmpty)
    }

    @Test func serverErrorStaysOnUploadWithItsMessage() async throws {
        let api = StubAPI()
        api.uploadResults = [.failure(.message("Only PDF and CSV files are supported"))]
        let m = model(api)
        m.begin()
        await m.upload(fileURL: try tempFile("a.pdf"))
        #expect(m.step == .upload)
        #expect(m.uploadError == "Only PDF and CSV files are supported")
        #expect(!m.isUploading)
    }

    @Test func oneFailureDoesNotLoseTheOthers() async throws {
        let api = StubAPI()
        api.uploadResults = [.failure(.offline), .success(StubAPI.statement(id: "ok", status: .uploaded))]
        let m = model(api)
        m.begin()
        await m.upload(fileURLs: [try tempFile("a.pdf"), try tempFile("b.pdf")])
        #expect(m.statementIDs == ["ok"])
        #expect(m.step == .processing)
        #expect(m.uploadError == APIError.offline.userMessage)
    }

    // MARK: Polling

    @Test func parsedMovesToReview() async {
        let api = StubAPI()
        api.statementScript = [
            [StubAPI.statement(id: "s1", status: .processing)],
            [StubAPI.statement(id: "s1", status: .parsed)],
        ]
        let m = processing(api, ids: ["s1"])
        await m.pollUntilProcessed()
        #expect(m.step == .review)
        #expect(api.calls.filter { $0 == "statements" }.count == 2)
    }

    @Test func failedStaysOnProcessingOfferingRetryAndRemove() async {
        let api = StubAPI()
        api.statementScript = [[StubAPI.statement(id: "s1", status: .failed)]]
        let m = processing(api, ids: ["s1"])
        await m.pollUntilProcessed()
        #expect(m.step == .processing)
        #expect(m.failedStatements.map(\.id) == ["s1"])
        #expect(OnboardingModel.failedMessage == "We couldn't read this statement.")
        #expect(!m.isStillWorking)
    }

    @Test func retryReprocessesThenPollsAgain() async {
        let api = StubAPI()
        api.statementScript = [
            [StubAPI.statement(id: "s1", status: .failed)],
            [StubAPI.statement(id: "s1", status: .processing)],
            [StubAPI.statement(id: "s1", status: .parsed)],
        ]
        let m = processing(api, ids: ["s1"])
        await m.pollUntilProcessed()
        await m.retry(id: "s1")
        #expect(api.calls.contains("reprocess(s1)"))
        await m.pollUntilProcessed()
        #expect(m.step == .review)
    }

    @Test func removeDropsTheStatementAndLastOneReturnsToUpload() async {
        let api = StubAPI()
        api.statementScript = [[StubAPI.statement(id: "s1", status: .failed)]]
        let m = processing(api, ids: ["s1"])
        await m.pollUntilProcessed()
        await m.remove(id: "s1")
        #expect(api.calls.contains("remove(s1)"))
        #expect(m.statementIDs.isEmpty)
        #expect(m.step == .upload)
    }

    @Test func removingOneOfTwoKeepsWaitingOnTheOther() async {
        let api = StubAPI()
        api.statementScript = [[StubAPI.statement(id: "s1", status: .failed), StubAPI.statement(id: "s2", status: .parsed)]]
        let m = processing(api, ids: ["s1", "s2"])
        await m.pollUntilProcessed()
        #expect(m.step == .processing)
        await m.remove(id: "s1")
        #expect(m.statementIDs == ["s2"])
        await m.pollUntilProcessed()
        #expect(m.step == .review)
    }

    @Test func pollingStopsAfterTheCapAndSaysItIsStillWorking() async {
        let api = StubAPI()
        api.statementScript = [[StubAPI.statement(id: "s1", status: .processing)]]
        let m = OnboardingModel(api: api, timeZone: chicago, pollInterval: .zero, maxPolls: 3, sleep: { _ in })
        m.begin()
        m.startProcessing([StubAPI.statement(id: "s1", status: .processing)])
        await m.pollUntilProcessed()
        #expect(api.calls.filter { $0 == "statements" }.count == 3)
        #expect(m.pollTimedOut)
        #expect(m.step == .processing)
        #expect(OnboardingModel.stillWorkingMessage == "Still working — we'll finish in the background.")
    }

    @Test func aDroppedConnectionDoesNotEndPolling() async {
        let api = StubAPI()
        api.statementFailures = 2
        api.statementScript = [[StubAPI.statement(id: "s1", status: .parsed)]]
        let m = processing(api, ids: ["s1"])
        await m.pollUntilProcessed()
        #expect(m.step == .review)
        #expect(api.calls.filter { $0 == "statements" }.count == 3)
    }

    @Test func pipelineStepGivesProgressCopy() {
        let m = model(StubAPI())
        m.begin()
        m.track(Statement(id: "s", status: .processing, fileType: "csv", createdAt: .now, pipelineStep: nil))
        #expect(m.progressMessage == "Reading your CSV...")
        m.track(Statement(id: "s", status: .processing, fileType: "pdf", createdAt: .now, pipelineStep: "classify_transactions"))
        #expect(m.progressMessage == "Categorizing expenses...")
    }

    // MARK: Bank name, review and split (R25)

    @Test func theBankNameGoesWithEveryFile() async throws {
        let api = StubAPI()
        let m = model(api)
        m.begin()
        await m.upload(fileURLs: [try tempFile("a.csv"), try tempFile("b.csv")], bankName: "Chase")
        #expect(api.calls.filter { $0.hasPrefix("upload") }.allSatisfy { $0.hasSuffix(" bank=Chase") })
    }

    @Test func aBlankBankNameIsLeftOut() async throws {
        let api = StubAPI()
        let m = model(api)
        m.begin()
        await m.upload(fileURLs: [try tempFile("a.pdf")], bankName: "   ")
        #expect(api.calls.contains { $0.hasPrefix("upload(a.pdf, application/pdf)") && !$0.contains("bank=") })
    }

    @Test func reviewShowsOnlyTheTrackedStatementsTransactions() async {
        let api = StubAPI()
        api.statementTransactions = [
            "s1": [Transaction(id: "1", date: "2026-10-02", description: "Cafe", amount: 4, type: .debit, category: nil)],
            "s2": [Transaction(id: "2", date: "2026-10-09", description: "Gas", amount: 30, type: .debit, category: nil)],
            "other": [Transaction(id: "3", date: "2026-10-10", description: "Old", amount: 1, type: .debit, category: nil)],
        ]
        let m = processing(api, ids: ["s1", "s2"])
        await m.loadReview()
        #expect(m.reviewTransactions.map(\.id) == ["2", "1"])
        #expect(api.calls.contains("transactions(s1)") && api.calls.contains("transactions(s2)"))
        #expect(!api.calls.contains("transactions"))
    }

    @Test func aSplitCSVExplainsItselfInsteadOfAdvancing() async {
        let api = StubAPI()
        api.statementScript = [[StubAPI.statement(id: "s1", status: .parsed, fileType: "csv", isParentSplit: true, childCount: 3)]]
        let m = processing(api, ids: ["s1"])
        await m.pollUntilProcessed()
        #expect(m.step == .processing)
        #expect(m.allParsedAreSplits)
        #expect(m.splitMessage == "Your statement was split into 3 monthly statements. They're processing in the background.")
    }

    @Test func splitMessageHandlesPluralAndUnknownCounts() {
        let m = model(StubAPI())
        m.startProcessing([StubAPI.statement(id: "a", status: .parsed, isParentSplit: true),
                           StubAPI.statement(id: "b", status: .parsed, isParentSplit: true, childCount: 2)])
        #expect(m.splitMessage == "Your statements were split into 2 monthly statements. They're processing in the background.")
        let n = model(StubAPI())
        n.startProcessing([StubAPI.statement(id: "a", status: .parsed, isParentSplit: true)])
        #expect(n.splitMessage == "Your statement was split into multiple monthly statements. They're processing in the background.")
    }

    // MARK: Review and finish

    @Test func reviewListsTheTransactionsFound() async {
        let api = StubAPI()
        api.statementTransactions = ["s1": [Transaction(id: "t", date: "2026-10-02", description: "Cafe", amount: 4.5, type: .debit, category: "Dining out")]]
        let m = processing(api, ids: ["s1"])
        await m.loadReview()
        #expect(m.reviewTransactions.count == 1)
    }

    @Test func reviewFailureIsAnEmptyList() async {
        let api = StubAPI()
        api.transactionsError = .offline
        let m = processing(api, ids: ["s1"])
        await m.loadReview()
        #expect(m.reviewTransactions.isEmpty)
        #expect(!m.isLoadingReview)
    }

    @Test func finishSendsTheDeviceTimeZoneThenCompletes() async throws {
        let api = StubAPI()
        let m = model(api)
        try await m.finish(emailReports: true)
        #expect(api.calls == ["updateProfile(email: true, tz: America/Chicago)", "completeOnboarding"])
    }

    @Test func finishWithEmailOffSendsFalse() async throws {
        let api = StubAPI()
        let m = model(api)
        try await m.finish(emailReports: false)
        #expect(api.calls.first == "updateProfile(email: false, tz: America/Chicago)")
    }

    @Test func finishThatFailsToSaveDoesNotComplete() async {
        let api = StubAPI()
        api.updateProfileError = .offline
        let m = model(api)
        await #expect(throws: APIError.offline) { try await m.finish(emailReports: true) }
        #expect(!api.calls.contains("completeOnboarding"))
    }
}
