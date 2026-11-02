import Foundation
import Observation
import SpendozaKit

/// A statement opened in Spendoza from the share sheet or Files. The file is copied into the app's temporary
/// folder, so it is ours to read whenever the upload runs and ours to delete afterwards.
enum OpenedFile {
    /// Where the copies live, one folder each so two files with the same name don't meet.
    static let folder = FileManager.default.temporaryDirectory.appendingPathComponent("opened-statements", isDirectory: true)

    private static let unreadable = APIError.message("Couldn't open this file. Try again.")

    /// Checks the type (PDF or CSV) and size (what the API accepts) of `url`, then returns a copy of it.
    static func accept(_ url: URL) -> Result<URL, APIError> {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard StatementFile.mimeType(for: url) != nil else { return .failure(.message(StatementFile.wrongTypeMessage)) }
        guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize else { return .failure(unreadable) }
        if size > APIClient.maxStatementBytes { return .failure(.fileTooLarge(maxMB: APIClient.maxStatementMB)) }
        let copy = folder.appendingPathComponent(UUID().uuidString, isDirectory: true).appendingPathComponent(url.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: copy.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: copy)
        } catch {
            return .failure(unreadable)
        }
        return .success(copy)
    }

    /// True for a copy `accept` made (these are not security scoped, and are deleted when done with).
    static func isCopy(_ url: URL) -> Bool {
        url.resolvingSymlinksInPath().path.hasPrefix(folder.resolvingSymlinksInPath().path + "/")
    }

    /// Deletes a copy made by `accept`; any other file is left alone.
    static func discard(_ url: URL) {
        guard isCopy(url) else { return }
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }

    /// Copies left behind by a run that was closed before they were uploaded.
    static func removeLeftovers() {
        try? FileManager.default.removeItem(at: folder)
    }
}

/// Statements opened from outside the app, waiting for Money's upload sheet to take them. They wait while the
/// app is signed out or locked.
@MainActor @Observable
final class IncomingStatements {
    private(set) var pending: [URL] = []
    /// Why the last file was refused, for an alert.
    var error: String?

    /// `.onOpenURL`: files are statements; anything else (auth callbacks, deep links) is not ours.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        open(url)
        return true
    }

    func open(_ url: URL) {
        switch OpenedFile.accept(url) {
        case .success(let copy): pending.append(copy)
        case .failure(let failure): error = failure.userMessage
        }
    }

    /// Hands the waiting files over (the receiver deletes them when done).
    func take() -> [URL] {
        defer { pending = [] }
        return pending
    }

    func discardAll() {
        pending.forEach(OpenedFile.discard)
        pending = []
    }
}
