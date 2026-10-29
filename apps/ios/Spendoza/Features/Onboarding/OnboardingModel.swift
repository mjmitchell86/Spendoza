import Foundation
import Observation
import SpendozaKit

/// The first-run flow, mirroring the web: welcome, upload, processing, review, complete.
@MainActor @Observable
final class OnboardingModel {
    enum Step: Int, CaseIterable { case welcome, upload, processing, review, complete }

    static let failedMessage = "We couldn't read this statement."
    static let stillWorkingMessage = "Still working — we'll finish in the background."
    static let wrongTypeMessage = "Choose a PDF or CSV file."

    private(set) var step: Step = .welcome
    /// Statements uploaded in this flow, in upload order, with their latest known status.
    private(set) var statements: [Statement] = []
    private(set) var uploadError: String?
    private(set) var isUploading = false
    /// Polling gave up waiting; the statements are still processing on the server.
    private(set) var pollTimedOut = false
    /// Bumped on every retry so the view restarts its polling task.
    private(set) var pollToken = 0
    private(set) var reviewTransactions: [Transaction] = []
    private(set) var isLoadingReview = false
    private(set) var actionError: String?

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let timeZone: TimeZone
    @ObservationIgnored private let pollInterval: Duration
    @ObservationIgnored private let maxPolls: Int
    @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
    @ObservationIgnored private var uploadTask: Task<Void, Never>?

    /// Polls every `pollInterval` up to `maxPolls` times (3 s and 40 polls by default: about two minutes).
    init(api: any SpendozaAPI, timeZone: TimeZone = .current, pollInterval: Duration = .seconds(3),
         maxPolls: Int = 40, sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) {
        self.api = api
        self.timeZone = timeZone
        self.pollInterval = pollInterval
        self.maxPolls = maxPolls
        self.sleep = sleep
    }

    var statementIDs: [String] { statements.map(\.id) }
    var failedStatements: [Statement] { statements.filter { $0.status == .failed } }
    var parsedCount: Int { statements.filter { $0.status == .parsed }.count }
    /// Some statement is still being read.
    var isStillWorking: Bool { statements.contains { $0.status == .uploaded || $0.status == .processing } }

    /// Every parsed statement was a multi-month CSV the server split into monthly statements.
    var allParsedAreSplits: Bool {
        let parsed = statements.filter { $0.status == .parsed }
        return !parsed.isEmpty && parsed.allSatisfy(\.isParentSplit)
    }

    /// The web's split message, for the processing step.
    var splitMessage: String {
        let splits = statements.filter { $0.status == .parsed && $0.isParentSplit }
        let total = splits.compactMap(\.childCount).reduce(0, +)
        let count = total > 0 ? "\(total)" : "multiple"
        let lead = splits.count == 1 ? "Your statement was" : "Your statements were"
        return "\(lead) split into \(count) monthly statements. They're processing in the background."
    }

    /// What the server is doing now, in the web's words.
    var progressMessage: String {
        let working = statements.first { $0.status == .uploaded || $0.status == .processing }
        switch working?.pipelineStep {
        case "extract_text": return working?.fileType == "csv" ? "Reading your CSV..." : "Reading your bank statement..."
        case "extract_transactions": return "Extracting transactions..."
        case "classify_transactions": return "Categorizing expenses..."
        case "match_and_insert": return "Preparing your data..."
        default:
            if working?.fileType == "csv", working?.pipelineStep == nil { return "Reading your CSV..." }
            return "Getting your transactions ready..."
        }
    }

    // MARK: Navigation

    func begin() { step = .upload }

    func back() { if step == .upload { step = .welcome } }

    func skipUpload() { step = .complete }

    /// Leaves processing for the review step.
    func continueToReview() { step = .review }

    /// Leaves processing for the last step without reviewing (everything failed, or still working).
    func continueToComplete() { step = .complete }

    func continueFromReview() { step = .complete }

    // MARK: Upload

    func upload(fileURL: URL) async { await upload(fileURLs: [fileURL]) }

    /// Starts an upload the model owns (so `cancel()` can stop it); `finally` runs when it ends, for example
    /// to release security-scoped file access.
    func startUpload(_ fileURLs: [URL], bankName: String, finally: @escaping @MainActor () -> Void) {
        uploadTask?.cancel()
        uploadTask = Task {
            await upload(fileURLs: fileURLs, bankName: bankName)
            finally()
        }
    }

    /// Stops an upload in flight (the screen went away or the person signed out).
    func cancel() { uploadTask?.cancel() }

    /// Uploads each file in turn, then moves to processing if at least one was accepted.
    func upload(fileURLs: [URL], bankName: String = "") async {
        uploadError = nil
        isUploading = true
        defer { isUploading = false }
        var errors: [String] = []
        var accepted = 0
        let bank = bankName.trimmingCharacters(in: .whitespacesAndNewlines)
        for url in fileURLs {
            if Task.isCancelled { break }
            guard let mime = Self.mimeType(for: url) else { errors.append(Self.wrongTypeMessage); continue }
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if size > APIClient.maxStatementBytes {
                errors.append(APIError.fileTooLarge(maxMB: APIClient.maxStatementMB).userMessage)
                continue
            }
            do {
                track(try await api.uploadStatement(fileURL: url, mimeType: mime, bankName: bank.isEmpty ? nil : bank))
                accepted += 1
            } catch let error as APIError {
                errors.append(error.userMessage)
            } catch {
                errors.append("Couldn't upload this file. Try again.")
            }
        }
        uploadError = errors.isEmpty ? nil : Array(NSOrderedSet(array: errors)).compactMap { $0 as? String }.joined(separator: " ")
        if accepted > 0 {
            pollTimedOut = false
            step = .processing
        }
    }

    private static func mimeType(for url: URL) -> String? {
        switch url.pathExtension.lowercased() {
        case "pdf": "application/pdf"
        case "csv": "text/csv"
        default: nil
        }
    }

    /// Follows these statements and shows the processing step.
    func startProcessing(_ statements: [Statement]) {
        statements.forEach(track)
        pollTimedOut = false
        step = .processing
    }

    /// Starts following a statement (also used after an upload).
    func track(_ statement: Statement) {
        if let index = statements.firstIndex(where: { $0.id == statement.id }) {
            statements[index] = statement
        } else {
            statements.append(statement)
        }
    }

    // MARK: Processing

    /// Polls until every statement is parsed (-> review) or failed (stay, so the person can retry or remove),
    /// or until `maxPolls` is spent (`pollTimedOut`). A dropped connection doesn't end polling.
    func pollUntilProcessed() async {
        pollTimedOut = false
        guard !statements.isEmpty else { return }
        for attempt in 0..<maxPolls {
            if attempt > 0 {
                do { try await sleep(pollInterval) } catch { return }
            }
            if let latest = try? await api.statements() {
                for index in statements.indices {
                    if let fresh = latest.first(where: { $0.id == statements[index].id }) { statements[index] = fresh }
                }
            }
            guard !isStillWorking else { continue }
            if failedStatements.isEmpty, parsedCount > 0, !allParsedAreSplits { step = .review }
            return
        }
        pollTimedOut = true
    }

    func retry(id: String) async {
        actionError = nil
        do {
            try await api.reprocessStatement(id: id)
            if let index = statements.firstIndex(where: { $0.id == id }) {
                let old = statements[index]
                statements[index] = Statement(id: old.id, status: .processing, fileType: old.fileType,
                                              bankName: old.bankName, accountLabel: old.accountLabel, createdAt: old.createdAt)
            }
            pollToken += 1
        } catch {
            actionError = (error as? APIError)?.userMessage ?? "Couldn't try again. Try again in a moment."
        }
    }

    func remove(id: String) async {
        actionError = nil
        do {
            try await api.removeStatement(id: id)
            statements.removeAll { $0.id == id }
            if statements.isEmpty { step = .upload }
            else if !isStillWorking, failedStatements.isEmpty, parsedCount > 0, !allParsedAreSplits { step = .review }
            else { pollToken += 1 }
        } catch {
            actionError = (error as? APIError)?.userMessage ?? "Couldn't remove this statement. Try again in a moment."
        }
    }

    // MARK: Review

    /// The transactions extracted from the statements uploaded in this flow, newest first.
    func loadReview() async {
        isLoadingReview = true
        defer { isLoadingReview = false }
        var found: [Transaction] = []
        for id in statementIDs {
            found += (try? await api.transactions(statementID: id)) ?? []
        }
        reviewTransactions = found.sorted { $0.date > $1.date }
    }

    // MARK: Finish

    /// Saves the time zone and email choice, then marks onboarding done. Throws if either call fails,
    /// so the person can try again.
    func finish(emailReports: Bool) async throws {
        _ = try await api.updateProfile(ProfileChange(emailReportsEnabled: emailReports, timezone: timeZone.identifier))
        try await api.completeOnboarding()
    }
}
