import Foundation
import Observation
import SpendozaKit

/// The checks a statement file passes on the phone before it is uploaded (shared with onboarding).
enum StatementFile {
    static let wrongTypeMessage = "Choose a PDF or CSV file."

    /// "application/pdf" or "text/csv" by extension; nil for anything else.
    static func mimeType(for url: URL) -> String? {
        switch url.pathExtension.lowercased() {
        case "pdf": "application/pdf"
        case "csv": "text/csv"
        default: nil
        }
    }

    /// Over the size the API accepts, so it is refused here without uploading.
    static func isTooLarge(_ url: URL) -> Bool {
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        return size > APIClient.maxStatementBytes
    }
}

/// One line of the Statements list, with its words already worked out.
struct StatementRow: Identifiable, Equatable {
    /// Why a statement failed, in the web's words. `reason` is nil when the server gave none.
    struct Failure: Equatable {
        /// "Failed to process this statement." or "Failed after 2 retries."
        let headline: String
        /// "Failed during: Extracting transactions"; nil when the step is unknown.
        let step: String?
        let reason: String?
    }

    let id: String
    /// The bank, or "Unknown bank".
    let title: String
    /// "October 2026", or "Pending" until the server knows.
    let monthText: String
    /// "Shared" (with the account label when there is one) or "Personal".
    let accountText: String
    let statusText: String
    let status: StatementStatus
    /// What the server is doing: "Reading PDF", or "Retrying (1/2) — Classifying". Only while processing.
    let progress: String?
    let failure: Failure?

    var isFailed: Bool { status == .failed }
    var isWorking: Bool { status == .uploaded || status == .processing }

    var accessibilitySummary: String {
        var parts = [title, monthText, accountText, statusText]
        if let progress { parts.append(progress) }
        if let failure {
            parts.append(failure.headline)
            parts += [failure.step, failure.reason].compactMap { $0 }
        }
        return parts.joined(separator: ", ")
    }
}

/// The Statements screen: the list the shared poller keeps current, and upload, retry and remove.
@MainActor @Observable
final class StatementsModel {
    let poller: StatementPoller
    private(set) var isUploading = false
    /// Statement ids with a retry or remove in flight.
    private(set) var busy: Set<String> = []
    /// Why the last retry or remove failed.
    private(set) var actionError: String?

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI

    init(api: any SpendozaAPI, poller: StatementPoller) {
        self.api = api
        self.poller = poller
    }

    // MARK: What the screen shows

    var rows: [StatementRow] { poller.statements.map(Self.row) }

    var isLoading: Bool { !poller.hasLoaded }

    /// Only shown when there is nothing to list: with a list on screen a failed refresh keeps the list.
    var loadError: String? { poller.statements.isEmpty ? poller.loadError : nil }

    /// Banks already used, for the upload sheet's suggestions.
    var bankNames: [String] {
        var seen = Set<String>()
        return poller.statements.compactMap { $0.bankName?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    static func row(_ statement: Statement) -> StatementRow {
        let bank = statement.bankName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = statement.accountLabel?.trimmingCharacters(in: .whitespacesAndNewlines)
        let account: String
        if statement.isShared {
            account = label.flatMap { $0.isEmpty ? nil : "Shared · \($0)" } ?? "Shared"
        } else {
            account = "Personal"
        }
        return StatementRow(
            id: statement.id,
            title: bank.flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown bank",
            monthText: statement.statementMonth.map { "\($0.name) \($0.year)" } ?? "Pending",
            accountText: account,
            statusText: statusText(statement.status),
            status: statement.status,
            progress: progress(statement),
            failure: failure(statement))
    }

    static func statusText(_ status: StatementStatus) -> String {
        switch status {
        case .uploaded: "Uploaded"
        case .processing: "Processing"
        case .parsed: "Parsed"
        case .failed: "Failed"
        }
    }

    /// The pipeline step in the web's words; "Processing" when the server hasn't named one.
    static func stepLabel(_ step: String?, fileType: String) -> String {
        switch step {
        case "extract_text": fileType == "csv" ? "Reading CSV" : "Reading PDF"
        case "extract_transactions": "Extracting transactions"
        case "classify_transactions": "Classifying"
        case "match_and_insert": "Matching & saving"
        default: "Processing"
        }
    }

    private static func progress(_ statement: Statement) -> String? {
        guard statement.status == .processing else { return nil }
        let step = stepLabel(statement.pipelineStep, fileType: statement.fileType)
        return statement.retryCount > 0 ? "Retrying (\(statement.retryCount)/2) — \(step)" : step
    }

    private static func failure(_ statement: Statement) -> StatementRow.Failure? {
        guard statement.status == .failed else { return nil }
        let retries = statement.failure?.retryCount ?? statement.retryCount
        let headline = retries > 0
            ? "Failed after \(retries) \(retries == 1 ? "retry" : "retries")."
            : "Failed to process this statement."
        let step = statement.failure?.step.map { stepLabel($0, fileType: statement.fileType) }
        // The server doesn't always say why; a blank line would look like a bug.
        let reason = statement.failure?.reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return .init(headline: headline, step: step.map { "Failed during: \($0)" }, reason: reason.flatMap { $0.isEmpty ? nil : $0 })
    }

    // MARK: Loading

    func load() async { await poller.refresh() }

    // MARK: Upload

    /// Uploads each file in turn, carrying on after one fails. Returns the problems by file name; a file not in
    /// the result was accepted.
    func upload(files: [URL], bankName: String, shared: Bool, accountLabel: String) async -> [String: String] {
        isUploading = true
        defer { isUploading = false }
        let bank = bankName.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = accountLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        var problems: [String: String] = [:]
        var accepted = 0
        for url in files {
            if Task.isCancelled { break }
            let name = url.lastPathComponent
            guard let mime = StatementFile.mimeType(for: url) else {
                problems[name] = "\(name): not a PDF or CSV"
                continue
            }
            if StatementFile.isTooLarge(url) {
                problems[name] = APIError.fileTooLarge(maxMB: APIClient.maxStatementMB).userMessage
                continue
            }
            do {
                _ = try await api.uploadStatement(fileURL: url, mimeType: mime, bankName: bank.isEmpty ? nil : bank,
                                                  shared: shared, accountLabel: shared && !label.isEmpty ? label : nil)
                accepted += 1
            } catch {
                if endsSession(error) { break }
                problems[name] = (error as? APIError)?.userMessage ?? "Couldn't upload this file. Try again."
            }
        }
        if accepted > 0 { await poller.refresh() }
        return problems
    }

    // MARK: Retry and remove

    func retry(_ id: String) async {
        await act(id, failure: "Couldn't try again. Try again in a moment.") { try await $0.reprocessStatement(id: id) }
    }

    func remove(_ id: String) async {
        await act(id, failure: "Couldn't remove this statement. Try again in a moment.") { try await $0.removeStatement(id: id) }
    }

    private func act(_ id: String, failure: String, _ call: (any SpendozaAPI) async throws -> Void) async {
        actionError = nil
        busy.insert(id)
        defer { busy.remove(id) }
        do {
            try await call(api)
        } catch {
            if !endsSession(error) { actionError = (error as? APIError)?.userMessage ?? failure }
            return
        }
        await poller.refresh()
    }

    private func endsSession(_ error: Error) -> Bool {
        switch error as? APIError {
        case .unauthorized:
            onSessionEnded?()
            return true
        case .accountDisabled(let text):
            onAccountDisabled?(text)
            return true
        default:
            return false
        }
    }
}
